import { NextResponse } from "next/server";
import { errorMessage, generateImage, inlineToDataUrl } from "../../lib/gemini";

// POST { description: "woman in her 30s, curly black hair, tall" }
// → { image: dataUrl (16:9), description }
//
// The avatar is generated once, in a plain neutral outfit, and becomes the
// base photo every garment is "tried on" to.
export const maxDuration = 60;

export async function POST(req: Request) {
  const { description } = (await req.json().catch(() => ({}))) as { description?: string };
  const desc = description?.trim();
  if (!desc) return NextResponse.json({ error: "Describe the avatar first." }, { status: 400 });

  const prompt = [
    "Photorealistic full-body fashion photograph, 16:9 landscape frame.",
    `The person: ${desc}.`,
    "They stand centered, facing the camera, arms relaxed at their sides, whole body visible from head to shoes with space above and below.",
    "They wear a plain fitted light-grey t-shirt, plain grey straight trousers and plain white sneakers, with no logos.",
    "Setting: a bright, minimalist boutique fitting room with pale wood floor, a soft beige curtain and diffuse daylight.",
    "Eye-level, medium wide shot, sharp focus, natural skin texture.",
  ].join(" ");

  try {
    const img = await generateImage([{ text: prompt }]);
    return NextResponse.json({ image: inlineToDataUrl(img), description: desc });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
  }
}
