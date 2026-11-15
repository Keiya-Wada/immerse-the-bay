import { NextResponse } from "next/server";
import { ThinkingLevel } from "@google/genai";
import { dataUrlToInline, errorMessage, gemini } from "../../lib/gemini";
import { KEEP_IN_PLACE } from "../../lib/closetPrompts";

// The director: Gemini looks at the live video and writes what Orbis is told.
//
// POST {
//   mode: "steer" | "check",
//   frame?: dataUrl,          // the current video frame (JPEG)
//   request?: string,         // steer: what the user asked for (a preset's prompt, or voice text)
//   action?: string,          // what the person is supposed to be doing right now
//   avatar?: string, outfit?: string[]
// }
// → { prompt: string | null, displaced: boolean, severe: boolean, note: string }
//
// steer: always returns a prompt for the requested change, keeping the person in
//   place; if the frame shows they've drifted, it first walks them back to their mark.
// check: the keep-in-place watchdog; returns a correction prompt only when the frame
//   shows the person displaced (off-centre, cropped, too close/far) or the outfit changed.
export const maxDuration = 30;

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash";

const RULES =
  "You direct Orbis, a live video model, for a virtual fitting room. The video shows one person (the user's double) " +
  "standing in the centre of the frame, full body head to toe, at a fixed distance, filmed by a static camera. " +
  "Orbis prompt rules: a follow-up prompt describes only what should change; the person, their outfit and the setting carry over. " +
  "Use plain positive sentences (avoid the words 'no', 'not', 'never', 'without'), one slow, small action at a time, " +
  "present tense, starting with 'The person'. Never describe camera moves, zooms or cuts. " +
  "Keep the person on the same spot, centred, at the same size in frame; to change location, the background changes around them. " +
  `Every prompt you write must end with exactly this sentence: "${KEEP_IN_PLACE}" ` +
  "Displaced means any of: the person's centre is clearly off the middle third of the frame; their head or feet are cut off; " +
  "they look much closer or farther than a full-body shot; they are leaving the frame; or garments of the outfit are missing or changed. " +
  "To correct displacement, the prompt first has the person stand still in the middle of the frame, small in the frame, " +
  "full body visible from head to feet with floor space around their feet, facing forward. " +
  "Avoid the words 'walk', 'step', 'move' and 'approach': in Orbis they make the camera travel.";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    mode?: "steer" | "check";
    frame?: string;
    request?: string;
    action?: string;
    avatar?: string;
    outfit?: string[];
  };
  const mode = b.mode === "check" ? "check" : "steer";
  if (mode === "steer" && !b.request?.trim()) return NextResponse.json({ error: "Nothing to direct." }, { status: 400 });

  const context =
    (b.avatar ? `The person: ${b.avatar}. ` : "") +
    (b.outfit?.length ? `Their outfit (must stay exactly this): ${b.outfit.join("; ")}. ` : "") +
    (b.action ? `What they are currently supposed to be doing: ${b.action}. ` : "");
  const task =
    mode === "steer"
      ? `The user asked for this change: "${b.request}". Write the follow-up prompt for it. ` +
        "If the frame shows the person displaced, begin the prompt with the correction, then the requested change. " +
        "If the request is a fast or large motion (spinning, jumping, running, dancing), turn it into a slow, small version on the spot. " +
        'Reply with only JSON: {"displaced": boolean, "note": a few words on what you saw, "prompt": string}.'
      : "Check the frame. If the person is displaced, write a correction prompt (keep their current action if it is a pose on the spot). " +
        "Showing their back or side because they are turning around is fine, not displacement. " +
        'Reply with only JSON: {"displaced": boolean, "severe": boolean, "note": a few words on what you saw, "prompt": string or null (null when not displaced)}. ' +
        "severe = a prompt can't fix it: only the face or upper body fills the frame, the person is mostly out of frame, it's a different person, or the outfit has clearly changed.";

  try {
    const res = await gemini().models.generateContent({
      model: TEXT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: `${RULES}\n\n${context}\n${b.frame ? "The image is the current video frame." : "(No frame available.)"}\n\n${task}` },
            ...(b.frame ? [{ inlineData: dataUrlToInline(b.frame) }] : []),
          ],
        },
      ],
      // Low thinking: same answers in ~2 s instead of ~5–10 s (it runs before every steer).
      config: { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    });
    const raw = res.text ?? "";
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { displaced?: boolean; severe?: boolean; note?: string; prompt?: string | null };
    let prompt = typeof j.prompt === "string" && j.prompt.trim() ? j.prompt.trim() : null;
    if (mode === "check" && !j.displaced) prompt = null;
    if (prompt && !prompt.includes(KEEP_IN_PLACE)) prompt = `${prompt.replace(/\s*$/, "")} ${KEEP_IN_PLACE}`;
    console.log(`[director] ${mode}${j.displaced ? " DISPLACED" : ""}${j.severe ? " SEVERE" : ""}: ${j.note ?? ""}${prompt ? ` → ${prompt}` : ""}`);
    return NextResponse.json({ prompt, displaced: !!j.displaced, severe: !!j.severe && !!j.displaced, note: j.note ?? "" });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
  }
}
