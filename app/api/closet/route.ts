import { NextResponse } from "next/server";
import { errorMessage } from "../../lib/gemini";
import { addItem, listItems } from "../../lib/wardrobe";

// GET → { items: ClosetItem[] }   (newest first; photos at /api/closet/<id>/image)
// POST { title?, text?, sourceUrl?, image?: dataUrl } → { item }
//   Saves the item and tags it with Gemini (category, type, clean name, description).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ items: await listItems() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { title?: string; text?: string; sourceUrl?: string; image?: string };
  if (!body.image && !body.text?.trim()) {
    return NextResponse.json({ error: "Add a photo, a product link or a description." }, { status: 400 });
  }
  try {
    return NextResponse.json({ item: await addItem(body) });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
