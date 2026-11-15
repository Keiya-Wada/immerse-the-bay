import { NextResponse } from "next/server";
import { addLook, listLooks, type LookLayer } from "../../lib/wardrobe";

// Saved looks (outfit snapshots), stored in data/looks/.
// GET → { looks }   POST { layers: LookLayer[] (image = data URL) } → { look }
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ looks: await listLooks() });
}

export async function POST(req: Request) {
  const { layers } = (await req.json().catch(() => ({}))) as { layers?: LookLayer[] };
  if (!Array.isArray(layers) || layers.length === 0 || layers.some((l) => !/^data:image\//.test(l.image ?? ""))) {
    return NextResponse.json({ error: "Nothing to save: put something on first." }, { status: 400 });
  }
  try {
    return NextResponse.json({ look: await addLook(layers) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
