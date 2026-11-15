import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Part } from "@google/genai";
import { dataUrlToInline, describe } from "./gemini";

// The saved closet, on the server's disk (data/, git-ignored): one JSON index
// plus one image file per item. Living on the server means the closet survives
// reloads and is the same on the laptop, a phone and the Quest.
//
// Note: this needs a writable disk, so it works for `npm run dev` / `npm start`
// on your own machine, not on Vercel's read-only filesystem.

export const SLOTS = ["top", "bottom", "dress", "outerwear", "shoes", "accessory"] as const;
export type Slot = (typeof SLOTS)[number];

export type ClosetItem = {
  id: string;
  title: string;
  slot?: Slot; // undefined until tagged (e.g. Gemini was busy when it was added)
  kind?: string; // finer type for browsing: "shirt", "t-shirt", "jeans", "sneakers"…
  garmentDescription?: string; // one sentence, used in the try-on and Orbis prompts
  text?: string; // what the user typed, for items added by description
  sourceUrl?: string;
  image?: string; // file name inside data/closet/
  addedAt: number;
};

const DIR = path.join(process.cwd(), "data", "closet");
const INDEX = path.join(DIR, "items.json");
const AVATAR = path.join(process.cwd(), "data", "avatar.json");

// Serialize writes so two quick adds can't clobber each other's index update.
let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function readIndex(): Promise<ClosetItem[]> {
  try {
    return JSON.parse(await fs.readFile(INDEX, "utf8")) as ClosetItem[];
  } catch {
    return [];
  }
}

async function writeIndex(items: ClosetItem[]) {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${INDEX}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(items, null, 2));
  await fs.rename(tmp, INDEX);
}

export const listItems = () => readIndex();

export async function getItem(id: string) {
  return (await readIndex()).find((i) => i.id === id);
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export async function addItem(input: {
  title?: string;
  text?: string;
  sourceUrl?: string;
  image?: string; // data URL
}): Promise<ClosetItem> {
  const id = randomUUID().slice(0, 8);
  let image: string | undefined;
  if (input.image) {
    const { mimeType, data } = dataUrlToInline(input.image);
    image = `${id}.${EXT[mimeType] ?? "jpg"}`;
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, image), Buffer.from(data, "base64"));
  }
  const item: ClosetItem = {
    id,
    title: input.title?.trim() || input.text?.trim().slice(0, 60) || "New item",
    text: input.text?.trim() || undefined,
    sourceUrl: input.sourceUrl,
    image,
    addedAt: Date.now(),
  };
  // Tag it (category, type, a clean name, a description). If Gemini is busy the
  // item is still saved, untagged; the first try-on tags it later.
  try {
    Object.assign(item, await tagGarment(item, input.image));
  } catch {
    /* saved untagged */
  }
  await locked(async () => writeIndex([item, ...(await readIndex())]));
  return item;
}

export async function updateItem(id: string, patch: Partial<Omit<ClosetItem, "id" | "image" | "addedAt">>) {
  return locked(async () => {
    const items = await readIndex();
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) return undefined;
    items[i] = { ...items[i], ...patch, id };
    await writeIndex(items);
    return items[i];
  });
}

export async function deleteItem(id: string) {
  return locked(async () => {
    const items = await readIndex();
    const item = items.find((x) => x.id === id);
    if (!item) return false;
    await writeIndex(items.filter((x) => x.id !== id));
    if (item.image) await fs.rm(path.join(DIR, item.image), { force: true });
    return true;
  });
}

/** The item's photo as a data URL (for Gemini), or undefined for description-only items. */
export async function itemImageDataUrl(item: ClosetItem): Promise<string | undefined> {
  if (!item.image) return undefined;
  const ext = path.extname(item.image).slice(1);
  const mime = Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "image/jpeg";
  const data = await fs.readFile(path.join(DIR, path.basename(item.image)));
  return `data:${mime};base64,${data.toString("base64")}`;
}

export async function itemImageFile(item: ClosetItem) {
  if (!item.image) return undefined;
  const ext = path.extname(item.image).slice(1);
  const mime = Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "image/jpeg";
  return { mime, data: await fs.readFile(path.join(DIR, path.basename(item.image))) };
}

// ── Tagging ──────────────────────────────────────────────────────────────────

export const SLOT_GUIDE =
  "top (shirt, t-shirt, blouse, sweater, hoodie, polo), bottom (pants, jeans, shorts, skirt), " +
  "dress (dress, jumpsuit, or other one-piece covering top and bottom), outerwear (coat, jacket, blazer, vest worn over a top), " +
  "shoes, accessory (hat, bag, scarf, belt, glasses, jewelry)";

export async function tagGarment(
  item: Pick<ClosetItem, "title" | "text">,
  imageDataUrl?: string,
): Promise<Pick<ClosetItem, "slot" | "kind" | "title" | "garmentDescription">> {
  const context = [item.title && `Name or file name: ${item.title}.`, item.text && `Description: ${item.text}.`]
    .filter(Boolean)
    .join(" ");
  const parts: Part[] = [
    {
      text:
        "You are cataloguing one clothing item for a wardrobe app. Reply with only a JSON object: " +
        '{"slot": one of top|bottom|dress|outerwear|shoes|accessory, ' +
        '"kind": the general garment type, lowercase, singular, used to group similar items: one of shirt, t-shirt, polo, sweater, hoodie, blouse, tank top, jeans, trousers, shorts, skirt, dress, jumpsuit, coat, jacket, blazer, vest, sneakers, boots, shoes, sandals, hat, bag, scarf, belt, glasses, jewelry, or another plain word if none fit (an oxford shirt is "shirt", chinos are "trousers"), ' +
        '"title": a short shopping-style name under 6 words with color and type, e.g. "Navy cable-knit sweater" (ignore camera file names like IMG_1234), ' +
        '"description": one sentence under 30 words for a video generation prompt starting with "a" or "an": garment type, exact colors, material, fit/length and distinctive details, no brand marketing, no person, no background}. ' +
        `Slots: ${SLOT_GUIDE}. ` +
        context,
    },
    ...(imageDataUrl ? [{ inlineData: dataUrlToInline(imageDataUrl) }] : []),
  ];
  const raw = await describe(parts);
  const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<string, string>;
  const slot = SLOTS.includes(json.slot as Slot) ? (json.slot as Slot) : undefined;
  return {
    slot,
    kind: json.kind?.toLowerCase().trim() || undefined,
    title: json.title?.trim() || item.title,
    garmentDescription: json.description?.trim() || undefined,
  };
}

// ── Saved avatar ─────────────────────────────────────────────────────────────

export type SavedAvatar = { description: string; image: string };

export async function loadAvatar(): Promise<SavedAvatar | null> {
  try {
    return JSON.parse(await fs.readFile(AVATAR, "utf8")) as SavedAvatar;
  } catch {
    return null;
  }
}

export async function saveAvatar(a: SavedAvatar) {
  await fs.mkdir(path.dirname(AVATAR), { recursive: true });
  await fs.writeFile(AVATAR, JSON.stringify(a));
}

// ── Saved looks (outfit snapshots) ───────────────────────────────────────────
// A look is the whole outfit stack at the moment it was saved: every layer's
// photo, so a look can be worn again and items taken off it without re-dressing.

export type LookLayer = { itemId: string; title: string; slot: Slot; description: string; image: string; chain: string[] };
export type Look = { id: string; layers: LookLayer[]; createdAt: number };

const LOOKS_DIR = path.join(process.cwd(), "data", "looks");
const LOOKS_INDEX = path.join(LOOKS_DIR, "looks.json");

async function readLooks(): Promise<Look[]> {
  try {
    return JSON.parse(await fs.readFile(LOOKS_INDEX, "utf8")) as Look[];
  } catch {
    return [];
  }
}

async function writeLooks(looks: Look[]) {
  await fs.mkdir(LOOKS_DIR, { recursive: true });
  const tmp = `${LOOKS_INDEX}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(looks, null, 2));
  await fs.rename(tmp, LOOKS_INDEX);
}

export const listLooks = () => readLooks();

/** Save a look; `image` on each layer is a data URL here and a file name once saved. */
export async function addLook(layers: LookLayer[]): Promise<Look> {
  const id = randomUUID().slice(0, 8);
  await fs.mkdir(LOOKS_DIR, { recursive: true });
  const saved: LookLayer[] = [];
  for (const [i, l] of layers.entries()) {
    const { mimeType, data } = dataUrlToInline(l.image);
    const file = `${id}-${i}.${EXT[mimeType] ?? "jpg"}`;
    await fs.writeFile(path.join(LOOKS_DIR, file), Buffer.from(data, "base64"));
    saved.push({ ...l, image: file });
  }
  const look: Look = { id, layers: saved, createdAt: Date.now() };
  await locked(async () => writeLooks([look, ...(await readLooks())]));
  return look;
}

export async function deleteLook(id: string) {
  return locked(async () => {
    const looks = await readLooks();
    const look = looks.find((l) => l.id === id);
    if (!look) return false;
    await writeLooks(looks.filter((l) => l.id !== id));
    for (const l of look.layers) await fs.rm(path.join(LOOKS_DIR, path.basename(l.image)), { force: true });
    return true;
  });
}

export async function lookImageFile(id: string, index: number) {
  const layer = (await readLooks()).find((l) => l.id === id)?.layers[index];
  if (!layer) return undefined;
  const ext = path.extname(layer.image).slice(1);
  const mime = Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "image/jpeg";
  return { mime, data: await fs.readFile(path.join(LOOKS_DIR, path.basename(layer.image))) };
}
