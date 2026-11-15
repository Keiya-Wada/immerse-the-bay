import "server-only";
import { GoogleGenAI, type Part } from "@google/genai";

// Gemini on **Vertex AI** (not AI Studio): the Google Cloud $300 trial credit
// only applies to Vertex usage. Auth, in order of preference:
//   1. GOOGLE_APPLICATION_CREDENTIALS_JSON — a service-account key pasted as
//      one line of JSON (use this on Vercel).
//   2. Application Default Credentials — run
//      `gcloud auth application-default login` once on your laptop.
// See docs/SETUP.md.

// Two quality tiers for try-on and avatar photos (switchable in the app):
// fast ≈ 8–10 s per photo; best is Gemini's pro image model: slower and pricier, but keeps
// fabric, prints, logos and the person's face noticeably more faithfully.
export type ImageQuality = "fast" | "best";
const FAST = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
const BEST = process.env.GEMINI_IMAGE_MODEL_BEST ?? "gemini-3-pro-image";
const SPARE = process.env.GEMINI_IMAGE_MODEL_SPARE ?? "gemini-3.1-flash-image";
// Each model has its own rate limit. This project's limit for the fast model is low
// (a third photo within a few seconds gets 429), so on a rate limit we try the next
// model at once, and only then wait and go round again.
const IMAGE_MODELS: Record<ImageQuality, string[]> = {
  fast: [...new Set([FAST, SPARE, BEST])],
  best: [...new Set([BEST, SPARE])],
};
const isRateLimit = (e: unknown) => /\b429\b|RESOURCE_EXHAUSTED/.test(e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const asQuality = (q: unknown): ImageQuality => (q === "best" ? "best" : "fast");
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash";

let client: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (client) return client;
  // Option: a Gemini API key from Google AI Studio (aistudio.google.com/apikey) instead of
  // Vertex — e.g. if the Cloud project is blocked or out of credit.
  if (process.env.GEMINI_API_KEY) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return client;
  }
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is not set on the server (see docs/SETUP.md)");
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? "global";
  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  client = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    ...(json ? { googleAuthOptions: { credentials: JSON.parse(json) } } : {}),
  });
  return client;
}

export type InlineImage = { mimeType: string; data: string }; // base64, no data: prefix

export function dataUrlToInline(dataUrl: string): InlineImage {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Expected a base64 data: URL");
  return { mimeType: m[1], data: m[2] };
}

export function inlineToDataUrl(img: InlineImage): string {
  return `data:${img.mimeType};base64,${img.data}`;
}

/** Ask the image model for one 16:9 image. Returns the first image part. */
export async function generateImage(parts: Part[], quality: ImageQuality = "fast"): Promise<InlineImage> {
  const waits = [0, 6000, 15000]; // up to ~20 s of waiting in total before giving up
  let last: unknown;
  for (const wait of waits) {
    if (wait) await sleep(wait);
    for (const model of IMAGE_MODELS[quality]) {
      try {
        return await generateWith(model, parts);
      } catch (e) {
        last = e;
        if (!isRateLimit(e)) throw e;
        console.warn(`[gemini] ${model} rate-limited; trying the next model`);
      }
    }
  }
  throw last;
}

async function generateWith(model: string, parts: Part[]): Promise<InlineImage> {
  const res = await gemini().models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["IMAGE", "TEXT"],
      imageConfig: { aspectRatio: "16:9" },
    },
  });
  const out = res.candidates?.[0]?.content?.parts ?? [];
  const img = out.find((p) => p.inlineData?.data);
  if (!img?.inlineData?.data) {
    const why = res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason ?? "no image returned";
    const text = out.map((p) => p.text).filter(Boolean).join(" ").slice(0, 300);
    throw new Error(`Gemini returned no image (${why})${text ? `: ${text}` : ""}`);
  }
  return { mimeType: img.inlineData.mimeType ?? "image/png", data: img.inlineData.data };
}

/** Short visual description, for building Orbis prompts. */
export async function describe(parts: Part[]): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await gemini().models.generateContent({ model: TEXT_MODEL, contents: [{ role: "user", parts }] });
      return (res.text ?? "").trim().replace(/\s+/g, " ");
    } catch (e) {
      if (!isRateLimit(e) || attempt >= 2) throw e;
      await sleep(3000 * (attempt + 1));
    }
  }
}

export function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[api error]", msg.slice(0, 500)); // every route's failure lands in the server log
  // Google refusing the whole project (account/policy block): nothing in the app can fix it.
  if (/PERMISSION_DENIED|terms of use/.test(msg))
    return "Google is refusing all Gemini requests for this project (403: rejected under its terms of use). Gemini features are off until that's resolved or another key is set.";
  // Vertex rate limit (only Gemini errors reach this: they say RESOURCE_EXHAUSTED or carry a 429 status).
  if (/RESOURCE_EXHAUSTED|"code":\s*429|\b429 Too Many/.test(msg)) return "Gemini is busy (rate limit) even after retrying. Wait ~30 seconds and try again.";
  return msg;
}
