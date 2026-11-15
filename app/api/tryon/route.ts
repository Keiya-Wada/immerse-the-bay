import { NextResponse } from "next/server";
import type { Part } from "@google/genai";
import { asQuality, dataUrlToInline, describe, errorMessage, generateImage, inlineToDataUrl } from "../../lib/gemini";
import { getItem, itemImageDataUrl, updateItem, SLOT_GUIDE, type Slot } from "../../lib/wardrobe";

// POST {
//   avatarImage: dataUrl,            // from /api/avatar (identity reference)
//   baseImage?: dataUrl,             // the current outfit to add to; omit to dress the bare avatar
//   garmentId?: string,              // a saved closet item (photo, notes and tags come from the closet)
//   garmentImage?: dataUrl,          // product photo (from /api/ingest or an upload)
//   garmentText?: string,            // a description, or extra notes ("in red")
//   title?: string                   // product name, used as a hint
//   quality?: "fast" | "best"        // which image model (see lib/gemini.ts)
// }
// → { image: dataUrl (16:9, person wearing the outfit plus this item), garmentDescription, slot }
//
// garmentDescription is a one-sentence visual description used to write the
// Orbis prompts, so the outfit stays described the same way while you steer.
// slot says which part of the outfit the item occupies, so the client knows
// what it replaces (a new top replaces the old top; outerwear layers on top).
export const maxDuration = 90;


function parseDescription(raw: string): { slot: Slot; garmentDescription: string } {
  const m = /^\s*\**\s*(top|bottom|dress|outerwear|shoes|accessory)\s*\**\s*[:|\-–]\s*(.+)$/is.exec(raw);
  if (m) return { slot: m[1].toLowerCase() as Slot, garmentDescription: m[2].trim() };
  return { slot: "accessory", garmentDescription: raw.trim() };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    avatarImage?: string;
    baseImage?: string;
    garmentId?: string;
    garmentImage?: string;
    garmentText?: string;
    title?: string;
    quality?: string;
  };
  if (!body.avatarImage) return NextResponse.json({ error: "Create an avatar first." }, { status: 400 });
  const saved = body.garmentId ? await getItem(body.garmentId) : undefined;
  if (body.garmentId && !saved) return NextResponse.json({ error: "That item is no longer in the closet." }, { status: 404 });
  if (saved) {
    body.garmentImage = await itemImageDataUrl(saved);
    body.garmentText = saved.text;
    body.title = saved.image ? saved.title : undefined;
  }
  if (!body.garmentImage && !body.garmentText?.trim()) {
    return NextResponse.json({ error: "Add a product link, a photo, or a description." }, { status: 400 });
  }

  try {
    const avatar = dataUrlToInline(body.avatarImage);
    const base = body.baseImage ? dataUrlToInline(body.baseImage) : null;
    const garment = body.garmentImage ? dataUrlToInline(body.garmentImage) : null;
    const notes = [body.title && `Product name: ${body.title}.`, body.garmentText?.trim()].filter(Boolean).join(" ");

    // 1) Describe + classify the garment (for Orbis prompts and outfit logic) in parallel with 2) the edit.
    const describeParts: Part[] = [
      {
        text:
          "Classify and describe only the clothing item for a video generation prompt. " +
          "Reply on one line as '<slot>: <description>'. slot is exactly one of: " +
          `${SLOT_GUIDE}. ` +
          "description is one sentence under 30 words: garment type, exact colors, material, fit/length, and distinctive details " +
          "(pattern, buttons, logo, collar). No brand marketing, no person, no background. Start it with 'a' or 'an'." +
          (notes ? ` Context: ${notes}` : ""),
      },
      ...(garment ? [{ inlineData: garment }] : []),
    ];

    // When adding to an existing outfit, the outfit photo is what gets edited and
    // the original avatar is passed along so the face doesn't drift over many edits.
    const person = base ?? avatar;
    const keep =
      "Keep the person's face, hair, skin, body shape and pose, the background, the lighting and the camera framing unchanged. " +
      "Full body visible head to shoes. Photorealistic. 16:9 landscape.";
    const layering = base
      ? "The person is already wearing an outfit. Add the new item to it: it replaces only the garment it would naturally replace " +
        "(a new top replaces their top, new shoes replace their shoes, a dress replaces both top and bottom), and outerwear is worn over what they have on. " +
        "Every other garment and accessory they are wearing stays exactly as it is, with the same colors, prints and details. "
      : "Replace only the matching part of their outfit. ";
    const identity = base
      ? [{ text: "The last image is the same person before dressing, for reference of their face and body only." }, { inlineData: avatar }]
      : [];

    const editParts: Part[] = garment
      ? [
          { text: "Image 1 is a person. Image 2 is a clothing product photo." },
          { inlineData: person },
          { inlineData: garment },
          ...identity,
          {
            text:
              "Edit image 1 so the person is wearing the clothing item from image 2. " +
              layering +
              "Reproduce the new item exactly: same color, pattern, fabric texture, cut, length, logos and details. Fit it naturally to their body. " +
              keep +
              " Store logos, watermarks and size captions overlaid on the corners of image 2 are not part of the garment: leave them out, and add no overlaid text to the result." +
              (notes ? ` Notes: ${notes}` : ""),
          },
        ]
      : [
          { text: "Image 1 is a person." },
          { inlineData: person },
          ...identity,
          { text: `Edit image 1 so the person is wearing: ${notes}. ` + layering + keep },
        ];

    // Saved items were tagged when added: reuse that instead of describing again.
    const known = saved?.slot && saved.garmentDescription ? { slot: saved.slot, garmentDescription: saved.garmentDescription } : null;
    const [tags, img] = await Promise.all([
      known ?? describe(describeParts).then(parseDescription),
      generateImage(editParts, asQuality(body.quality)),
    ]);
    if (saved && !known) await updateItem(saved.id, tags).catch(() => undefined); // tag it for next time
    return NextResponse.json({ image: inlineToDataUrl(img), ...tags });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
  }
}
