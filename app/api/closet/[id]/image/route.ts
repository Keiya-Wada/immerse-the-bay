import { getItem, itemImageFile } from "../../../../lib/wardrobe";

// GET → the item's photo. Item ids are random and the file name comes from the
// saved index (never from the URL), so this can't read other files.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  const file = item && (await itemImageFile(item).catch(() => undefined));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: { "Content-Type": file.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
