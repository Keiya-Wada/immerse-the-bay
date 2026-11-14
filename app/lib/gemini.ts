import "server-only";
import { GoogleGenAI, type Part } from "@google/genai";

// Gemini on **Vertex AI** (not AI Studio): the Google Cloud $300 trial credit
// only applies to Vertex usage. Auth, in order of preference:
//   1. GOOGLE_APPLICATION_CREDENTIALS_JSON — a service-account key pasted as
//      one line of JSON (use this on Vercel).
//   2. Application Default Credentials — run
//      `gcloud auth application-default login` once on your laptop.
// See docs/SETUP.md.

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash";

let client: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (client) return client;
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
export async function generateImage(parts: Part[]): Promise<InlineImage> {
  const res = await gemini().models.generateContent({
    model: IMAGE_MODEL,
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
  const res = await gemini().models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: "user", parts }],
  });
  return (res.text ?? "").trim().replace(/\s+/g, " ");
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
