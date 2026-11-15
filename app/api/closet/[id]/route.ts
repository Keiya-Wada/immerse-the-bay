import { NextResponse } from "next/server";
import { deleteItem, updateItem, SLOTS, type Slot } from "../../../lib/wardrobe";

// PATCH { title?, slot?, kind?, garmentDescription? } → { item }   (fix a category, rename)
// DELETE → { ok: true }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Parameters<typeof updateItem>[1] = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 80);
  if (typeof body.kind === "string") patch.kind = body.kind.trim().toLowerCase().slice(0, 30) || undefined;
  if (typeof body.slot === "string" && SLOTS.includes(body.slot as Slot)) patch.slot = body.slot as Slot;
  if (typeof body.garmentDescription === "string") patch.garmentDescription = body.garmentDescription.trim().slice(0, 300);
  const item = await updateItem(id, patch);
  return item ? NextResponse.json({ item }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (await deleteItem(id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
