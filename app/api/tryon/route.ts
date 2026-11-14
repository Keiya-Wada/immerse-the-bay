import { NextResponse } from "next/server";
import type { Part } from "@google/genai";
import { dataUrlToInline, describe, errorMessage, generateImage, inlineToDataUrl } from "../../lib/gemini";

// POST {
//   avatarImage: dataUrl,            // from /api/avatar
//   garmentImage?: dataUrl,          // product photo (from /api/ingest or an upload)
//   garmentText?: string,            // a description, or extra notes ("in red")
//   title?: string                   // product name, used as a hint
// }
// → { image: dataUrl (16:9, avatar wearing the item), garmentDescription }
//
// garmentDescription is a one-sentence visual description used to write the
// Orbis prompts, so the outfit stays described the same way while you steer.
export const maxDuration = 90;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    avatarImage?: string;
    garmentImage?: string;
    garmentText?: string;
    title?: string;
  };
  if (!body.avatarImage) return NextResponse.json({ error: "Create an avatar first." }, { status: 400 });
  if (!body.garmentImage && !body.garmentText?.trim()) {
    return NextResponse.json({ error: "Add a product link, a photo, or a description." }, { status: 400 });
  }

  try {
    const avatar = dataUrlToInline(body.avatarImage);
    const garment = body.garmentImage ? dataUrlToInline(body.garmentImage) : null;
    const notes = [body.title && `Product name: ${body.title}.`, body.garmentText?.trim()].filter(Boolean).join(" ");

    // 1) Describe the garment (for Orbis prompts) in parallel with 2) the edit.
    const describeParts: Part[] = [
      {
        text:
          "Describe only the clothing item for a video generation prompt, in one sentence under 35 words: " +
          "garment type, exact colors, material, fit/length, and distinctive details (pattern, buttons, logo, collar). " +
          "No brand marketing, no person, no background. Start with 'a' or 'an'." +
          (notes ? ` Context: ${notes}` : ""),
      },
      ...(garment ? [{ inlineData: garment }] : []),
    ];

    const editParts: Part[] = garment
      ? [
          { text: "Image 1 is a person. Image 2 is a clothing product photo." },
          { inlineData: avatar },
          { inlineData: garment },
          {
            text:
              "Edit image 1 so the person is wearing the clothing item from image 2, replacing only the matching part of their outfit. " +
              "Reproduce the item exactly: same color, pattern, fabric texture, cut, length, logos and details. Fit it naturally to their body. " +
              "Keep the person's face, hair, skin, body shape and pose, the background, the lighting and the camera framing unchanged. " +
              "Full body visible head to shoes. Photorealistic. 16:9 landscape. " +
              "Store logos, watermarks and size captions overlaid on the corners of image 2 are not part of the garment: leave them out, and add no overlaid text to the result." +
              (notes ? ` Notes: ${notes}` : ""),
          },
        ]
      : [
          { inlineData: avatar },
          {
            text:
              `Edit this photo so the person is wearing: ${notes}. Replace only the matching part of their outfit. ` +
              "Keep the person's face, hair, skin, body shape and pose, the background, the lighting and the camera framing unchanged. " +
              "Full body visible head to shoes. Photorealistic. 16:9 landscape.",
          },
        ];

    const [garmentDescription, img] = await Promise.all([describe(describeParts), generateImage(editParts)]);
    return NextResponse.json({ image: inlineToDataUrl(img), garmentDescription });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
  }
}
