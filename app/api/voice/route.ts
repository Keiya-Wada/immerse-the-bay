import { NextResponse } from "next/server";
import { ThinkingLevel } from "@google/genai";
import { dataUrlToInline, errorMessage, gemini } from "../../lib/gemini";
import { listItems } from "../../lib/wardrobe";
import type { VoiceIntent } from "../../lib/voiceIntent";

// POST { audio: dataUrl (WAV), outfit: itemId[], steers: { poses: string[], places: string[] } }
// → { transcript, intent }
//
// One Gemini call both transcribes the spoken command and works out what it
// means against the user's saved closet, e.g.
//   "let's try the red knit sweater with blue jeans and a pair of loafers"
//   → { kind: "outfit", mode: "replace", itemIds: [...], missing: ["loafers"] }
export const maxDuration = 30;

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    audio?: string;
    outfit?: string[];
    steers?: { poses?: string[]; places?: string[] };
  };
  if (!body.audio?.startsWith("data:audio/")) return NextResponse.json({ error: "No recording received." }, { status: 400 });

  const items = await listItems();
  const closet = items
    .map((i) => `- id ${i.id}: ${i.title}${i.kind ? ` (${i.kind}` : " ("}${i.slot ? `, ${i.slot}` : ""})${i.garmentDescription ? ` — ${i.garmentDescription}` : ""}`)
    .join("\n");
  const wearing = (body.outfit ?? []).map((id) => items.find((i) => i.id === id)?.title ?? id).join(", ") || "nothing yet";
  const poses = body.steers?.poses ?? [];
  const places = body.steers?.places ?? [];

  const prompt =
    "You control a virtual fitting room by voice. Transcribe the user's spoken command, then decide what it asks for. " +
    "Reply with only a JSON object {\"transcript\": string, \"intent\": object}. intent is one of:\n" +
    '- {"kind":"outfit","mode":"replace"|"add"|"remove","itemIds":[...],"missing":[...]}: choosing clothes. ' +
    '"replace" = a whole new outfit ("let\'s try X with Y", "put me in…"); "add" = add to what they wear ("add the scarf", "with the loafers too"); ' +
    '"remove" = take items off ("take off the jacket"). itemIds are ids from the closet below that best match each piece mentioned ' +
    "(match by color, type and name; pick the single best match per piece). missing lists pieces they asked for that are not in the closet, in a few words each.\n" +
    `- {"kind":"pose","label":L}: the person should move or pose; L is exactly one of: ${poses.join(", ")} (closest match).\n` +
    `- {"kind":"place","label":L}: go somewhere / change the background; L is exactly one of: ${places.join(", ")} (closest match).\n` +
    '- {"kind":"custom","text":T}: a pose or place not in those lists. For a pose, T is one short sentence like "The person <does it slowly>, standing on the same spot." (slow, small movements only: a spin or twirl becomes the "Turn around" pose; no jumping or dancing). ' +
    'For a place, T is "The background behind the person becomes <the place, a few vivid details>, while they stand on the same spot."\n' +
    '- {"kind":"save_look"}: save / remember / keep this look or outfit.\n' +
    '- {"kind":"pause"} or {"kind":"resume"}: pause or resume the video.\n' +
    '- {"kind":"none","reply":R}: anything else, or silence/noise; R is a short friendly sentence saying what you can do.\n' +
    `Currently wearing: ${wearing}.\nCloset:\n${closet || "(empty)"}`;

  try {
    const res = await gemini().models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: dataUrlToInline(body.audio) }] }],
      config: { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    });
    const raw = res.text ?? "";
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { transcript?: string; intent?: VoiceIntent };
    const intent = json.intent ?? { kind: "none", reply: "Sorry, I didn't catch that." };
    if (intent.kind === "outfit") {
      const known = new Set(items.map((i) => i.id));
      intent.itemIds = (intent.itemIds ?? []).filter((id) => known.has(id));
      intent.missing = intent.missing ?? [];
    }
    return NextResponse.json({ transcript: json.transcript ?? "", intent });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
  }
}
