import { lookImageFile } from "../../../../lib/wardrobe";

// A saved look's photo at one layer (index 0 = first item put on; the last is the full outfit).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await params;
  const file = await lookImageFile(id, Number(index));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: { "Content-Type": file.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
