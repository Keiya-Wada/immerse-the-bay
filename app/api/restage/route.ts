import { NextResponse } from "next/server";
import { dataUrlToInline, errorMessage, generateImage, inlineToDataUrl } from "../../lib/gemini";

// POST { image: dataUrl (outfit photo), place: string } → { image: dataUrl }
// The same photo with only the background changed, so the live video can be
// restarted (re-anchored) in the place the user steered to, full-body and centred.
export const maxDuration = 90;

export async function POST(req: Request) {
  const { image, place } = (await req.json().catch(() => ({}))) as { image?: string; place?: string };
  if (!image?.startsWith("data:image/") || !place?.trim()) return NextResponse.json({ error: "Need a photo and a place." }, { status: 400 });
  try {
    const out = await generateImage([
      { inlineData: dataUrlToInline(image) },
      {
        text:
          `Change only the background to: ${place}. Keep the person exactly as they are: face, hair, body, pose, ` +
          "every garment and detail, their size and position in the frame. Full body visible head to shoes, centred, " +
          "natural lighting that matches the new setting. Photorealistic. 16:9 landscape.",
      },
    ]);
    return NextResponse.json({ image: inlineToDataUrl(out) });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
  }
}
