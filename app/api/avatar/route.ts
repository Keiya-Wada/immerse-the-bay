import { NextResponse } from "next/server";
import { asQuality, errorMessage, generateImage, inlineToDataUrl } from "../../lib/gemini";
import { loadAvatar, saveAvatar } from "../../lib/wardrobe";

// GET → { avatar: { image, description } | null }   (the last one created, saved on the server)
// POST { description: "woman in her 30s, curly black hair, tall" }
// → { image: dataUrl (16:9), description }   (and saves it)
//
// The avatar is generated once, in a plain neutral outfit, and becomes the
// base photo every garment is "tried on" to.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ avatar: await loadAvatar() });
}

export async function POST(req: Request) {
  const { description, quality } = (await req.json().catch(() => ({}))) as { description?: string; quality?: string };
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
    const img = await generateImage([{ text: prompt }], asQuality(quality));
    const avatar = { image: inlineToDataUrl(img), description: desc };
    await saveAvatar(avatar).catch(() => undefined); // read-only disk (e.g. Vercel): just don't persist
    return NextResponse.json(avatar);
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
  }
}
