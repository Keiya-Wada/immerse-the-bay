import { NextResponse } from "next/server";
import { dataUrlToInline, errorMessage, generateImage, inlineToDataUrl } from "../../lib/gemini";

// POST { image: dataUrl (the current outfit photo) } → { image: dataUrl (turnaround sheet) }
//
// The VR "statue": Gemini's pro image model draws the person in their outfit
// from four sides on a flat green background, in one image so the four views
// match. The client cuts the views apart and shows the one that faces you, so
// you can walk around it (see app/vr/Statue.tsx).
export const maxDuration = 90;

export async function POST(req: Request) {
  const { image } = (await req.json().catch(() => ({}))) as { image?: string };
  if (!image?.startsWith("data:image/")) return NextResponse.json({ error: "Put an outfit on first." }, { status: 400 });
  try {
    const sheet = await generateImage(
      [
        { inlineData: dataUrlToInline(image) },
        {
          text:
            "Make a character turnaround sheet of exactly this person in exactly this outfit, for a 3D artist. " +
            "Four full-body views in one row, evenly spaced with clear gaps, all the same size, feet on the same baseline, " +
            "standing straight with arms relaxed slightly away from the body, from left to right: " +
            "1) front view facing the viewer, 2) side view of the person facing the left edge of the image, " +
            "3) back view, 4) side view of the person facing the right edge of the image. " +
            "Keep their face, hair, body and every garment, color, print and detail identical in all four views. " +
            "Each figure fills most of the image height, head to shoes fully visible. " +
            "Solid flat pure green background (#00FF00) everywhere, even lighting, no shadows, no floor, no text or labels. 16:9.",
        },
      ],
      "best",
    );
    return NextResponse.json({ image: inlineToDataUrl(sheet) });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
  }
}
