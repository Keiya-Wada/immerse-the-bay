"use client";

import { create } from "zustand";

// Client-side state for the fitting room: the avatar, the closet, and the
// outfit being built from it. The closet and the avatar are saved on the
// server (see app/lib/wardrobe.ts), so they survive reloads and are shared by
// every device that opens the site; the outfit photos live in memory only.
//
// The outfit is a stack of layers. Each "put on" edits the current outfit
// photo (not the bare avatar), so items combine. A layer remembers the chain
// of items that produced its photo, so taking an item off can reuse the
// photos below it and only re-dress the items above.

export type Avatar = { description: string; image: string };

export type Slot = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";

export const CATEGORIES: { slot: Slot; label: string }[] = [
  { slot: "top", label: "Tops" },
  { slot: "bottom", label: "Bottoms" },
  { slot: "dress", label: "Dresses" },
  { slot: "outerwear", label: "Outerwear" },
  { slot: "shoes", label: "Shoes" },
  { slot: "accessory", label: "Accessories" },
];

/** A saved closet item (mirrors ClosetItem in app/lib/wardrobe.ts) plus client-only state. */
export type Item = {
  id: string;
  title: string;
  slot?: Slot; // undefined = not sorted yet
  kind?: string; // "shirt", "jeans", "sneakers"…
  garmentDescription?: string;
  text?: string; // description typed by the user
  sourceUrl?: string;
  image?: string; // file name on the server; see itemImageUrl
  addedAt: number;
  error?: string; // client-only: last try-on error
};

export const itemImageUrl = (item: Pick<Item, "id" | "image">) =>
  item.image ? `/api/closet/${item.id}/image` : undefined;

/** An item being saved and sorted (shown as a placeholder card). */
export type Pending = { key: string; title: string; preview?: string };

export type Layer = {
  itemId: string;
  slot: Slot;
  description: string;
  image: string; // the outfit photo after this layer
  chain: string[]; // every item id applied, in order, to produce `image` (including ones since replaced)
};

/** A saved look (outfit snapshot). Layer images are server file names; see lookImageUrl. */
export type Look = {
  id: string;
  layers: (Layer & { title: string })[];
  createdAt: number;
};

/** A look's photo: the full outfit by default, or the photo after layer `index`. */
export const lookImageUrl = (look: Look, index = look.layers.length - 1) => `/api/looks/${look.id}/${index}`;

/** Item names, top layer first: "Navy coat, white shirt and jeans". */
export function lookTitle(look: Pick<Look, "layers">): string {
  const t = look.layers.map((l) => l.title).reverse();
  return t.length <= 1 ? (t[0] ?? "") : `${t.slice(0, -1).join(", ")} and ${t.at(-1)}`;
}

/** Photo quality: "fast" (Gemini Flash image, ~10 s) or "best" (Gemini Pro image, slower, more faithful). */
export type Quality = "fast" | "best";
function readQuality(): Quality {
  try {
    return typeof window !== "undefined" && localStorage.getItem("photoQuality") === "best" ? "best" : "fast";
  } catch {
    return "fast";
  }
}
export function setQuality(quality: Quality) {
  useCloset.setState({ quality });
  try {
    localStorage.setItem("photoQuality", quality);
  } catch {
    /* private mode */
  }
}
/** Rough seconds per photo, for progress messages. */
export const photoSeconds = (q: Quality) => (q === "best" ? 18 : 12);

type ClosetState = {
  loaded: boolean;
  avatar: Avatar | null;
  items: Item[];
  pending: Pending[];
  addError: string | null;
  outfit: Layer[];
  busy: string | null; // what the outfit is doing right now, e.g. "Putting on Linen shirt…"
  outfitError: string | null;
  wornImage: string | null; // the outfit photo currently in the mirror
  looks: Look[];
  compareId: string | null; // a saved look shown next to the current outfit
  quality: Quality; // which Gemini image model makes the photos
  statue: { sheet: string; from: string } | null; // turnaround sheet for the VR statue, and the outfit photo it was made from
  statueBusy: boolean;
  statueError: string | null;
  setAvatar: (a: Avatar | null) => void;
  updateItem: (id: string, patch: Partial<Item>) => void;
  removeItem: (id: string) => void;
  setWorn: (image: string | null) => void;
};

export const useCloset = create<ClosetState>((set) => ({
  loaded: false,
  avatar: null,
  items: [],
  pending: [],
  addError: null,
  outfit: [],
  busy: null,
  outfitError: null,
  wornImage: null,
  looks: [],
  compareId: null,
  quality: "fast", // read from localStorage in loadCloset (after hydration)
  statue: null,
  statueBusy: false,
  statueError: null,
  // A new avatar invalidates every outfit photo.
  setAvatar: (avatar) => set({ avatar, outfit: [], wornImage: null, outfitError: null }),
  updateItem: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  setWorn: (wornImage) => set({ wornImage }),
}));

// ── Saved closet (server) ────────────────────────────────────────────────────

/** Load the saved closet and avatar. Safe to call more than once. */
export async function loadCloset() {
  const [c, a, l] = await Promise.all([
    fetch("/api/closet").then((r) => r.json() as Promise<{ items?: Item[] }>),
    fetch("/api/avatar").then((r) => r.json() as Promise<{ avatar?: Avatar | null }>),
    fetch("/api/looks").then((r) => r.json() as Promise<{ looks?: Look[] }>).catch(() => ({ looks: undefined })),
  ]);
  useCloset.setState((s) => ({
    loaded: true,
    items: c.items ?? s.items,
    looks: l.looks ?? s.looks,
    quality: readQuality(),
    // Don't replace an avatar created in this tab (it would wipe the outfit).
    ...(s.avatar || !a.avatar ? {} : { avatar: a.avatar }),
  }));
}

/** Save a new item (photo, product link result or description). It is sorted by Gemini on the server. */
export async function addToCloset(input: { title?: string; text?: string; sourceUrl?: string; image?: string }) {
  const key = Math.random().toString(36).slice(2);
  const preview = input.image ? await shrinkImage(input.image, 1024).catch(() => input.image) : undefined;
  useCloset.setState((s) => ({
    pending: [{ key, title: input.title || input.text || "New item", preview }, ...s.pending],
    addError: null,
  }));
  try {
    const { item } = await postJson<{ item: Item }>("/api/closet", { ...input, image: preview });
    useCloset.setState((s) => ({ items: [item, ...s.items] }));
    return item;
  } catch (e) {
    useCloset.setState({ addError: e instanceof Error ? e.message : String(e) });
  } finally {
    useCloset.setState((s) => ({ pending: s.pending.filter((p) => p.key !== key) }));
  }
}

/** Fix an item's category, type or name. */
export async function editItem(id: string, patch: { title?: string; slot?: Slot; kind?: string }) {
  useCloset.getState().updateItem(id, patch);
  await fetch(`/api/closet/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => undefined);
}

/** Downscale a photo (phone photos are huge) to a JPEG data URL on a white background. */
export async function shrinkImage(src: string, max = 1024): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const k = Math.min(1, max / Math.max(img.width, img.height));
  if (k === 1 && /^data:image\/jpeg/.test(src)) return src;
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; // transparent PNG product shots
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.88);
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  Object.assign(window, { __closet: useCloset }); // for headless tests
}

/** Does a new item in `slot` replace an existing layer in `existing`? */
function replaces(slot: Slot, existing: Slot): boolean {
  if (slot === "accessory" || existing === "accessory") return false;
  if (slot === existing) return true;
  if (slot === "dress") return existing === "top" || existing === "bottom";
  if (existing === "dress") return slot === "top" || slot === "bottom";
  return false;
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

async function dressLayer(avatar: Avatar, below: Layer | undefined, item: Item): Promise<Layer> {
  const r = await postJson<{ image: string; garmentDescription: string; slot: Slot }>("/api/tryon", {
    avatarImage: avatar.image,
    baseImage: below?.image,
    garmentId: item.id, // the server reads the photo, notes and tags from the saved closet
    quality: useCloset.getState().quality,
  });
  useCloset.getState().updateItem(item.id, { slot: r.slot, garmentDescription: r.garmentDescription, error: undefined });
  return {
    itemId: item.id,
    slot: r.slot,
    description: r.garmentDescription,
    image: r.image,
    chain: [...(below?.chain ?? []), item.id],
  };
}

/**
 * Re-dress `wanted` (item ids, bottom to top), reusing existing layer photos
 * for the longest prefix that is still valid. `keep` caps how many layers may
 * be reused (used by "redo last item").
 */
async function rebuild(wanted: string[], label: string, keep = Infinity) {
  const st = useCloset.getState();
  const avatar = st.avatar;
  if (!avatar || st.busy) return;
  const byId = new Map(st.outfit.map((l) => [l.itemId, l]));
  const layers: Layer[] = [];
  for (const id of wanted) {
    const l = byId.get(id);
    if (layers.length >= keep || !l || !sameIds(l.chain, [...layers.map((x) => x.itemId), id])) break;
    layers.push(l);
  }
  useCloset.setState({ busy: label, outfitError: null });
  try {
    for (const id of wanted.slice(layers.length)) {
      const item = useCloset.getState().items.find((i) => i.id === id);
      if (!item) continue;
      useCloset.setState({ busy: `${label} ${item.title}…` });
      const layer = await dressLayer(avatar, layers.at(-1), item);
      if (useCloset.getState().avatar !== avatar) return; // avatar changed meanwhile
      layers.push(layer);
    }
    useCloset.setState({ outfit: layers });
  } catch (e) {
    if (useCloset.getState().avatar === avatar) useCloset.setState({ outfitError: e instanceof Error ? e.message : String(e) });
  } finally {
    useCloset.setState({ busy: null });
  }
}

/** Put an item on over the current outfit. Whatever it replaces comes off. */
export async function putOn(itemId: string) {
  const st = useCloset.getState();
  const avatar = st.avatar;
  const item = st.items.find((i) => i.id === itemId);
  if (!avatar || !item || st.busy || st.outfit.some((l) => l.itemId === itemId)) return;
  useCloset.setState({ busy: `Putting on ${item.title}…`, outfitError: null });
  useCloset.getState().updateItem(itemId, { error: undefined });
  try {
    const layer = await dressLayer(avatar, st.outfit.at(-1), item);
    if (useCloset.getState().avatar !== avatar) return;
    useCloset.setState((s) => ({ outfit: [...s.outfit.filter((l) => !replaces(layer.slot, l.slot)), layer] }));
  } catch (e) {
    useCloset.getState().updateItem(itemId, { error: e instanceof Error ? e.message : String(e) });
  } finally {
    useCloset.setState({ busy: null });
  }
}

/** Take one item off: photos below it are reused, items above are re-dressed. */
export function takeOff(itemId: string) {
  const ids = useCloset.getState().outfit.map((l) => l.itemId);
  return rebuild(ids.filter((id) => id !== itemId), "Re-dressing");
}

/** Generate the top layer again (Gemini sometimes gets one wrong). */
export function redoLast() {
  const ids = useCloset.getState().outfit.map((l) => l.itemId);
  return rebuild(ids, "Redoing", ids.length - 1);
}

const SLOT_ORDER: Slot[] = ["bottom", "dress", "top", "shoes", "outerwear", "accessory"];

/**
 * Dress a whole outfit (used by voice): items go on bottom-up (trousers, then
 * shirt, shoes, coat, accessories) and photos already made for the same items
 * in the same order are reused.
 */
export function dressOutfit(itemIds: string[]) {
  const items = useCloset.getState().items;
  const rank = (id: string) => {
    const slot = items.find((i) => i.id === id)?.slot;
    return slot ? SLOT_ORDER.indexOf(slot) : SLOT_ORDER.length;
  };
  const ordered = [...new Set(itemIds)].sort((a, b) => rank(a) - rank(b));
  return rebuild(ordered, "Dressing:");
}

/** Take several items off at once. */
export function takeOffMany(itemIds: string[]) {
  const ids = useCloset.getState().outfit.map((l) => l.itemId);
  return rebuild(ids.filter((id) => !itemIds.includes(id)), "Re-dressing");
}

export function clearOutfit() {
  useCloset.setState({ outfit: [], outfitError: null });
}

/** Delete an item from the closet (and the server), taking it off first if it's being worn. */
export async function deleteItem(itemId: string) {
  if (useCloset.getState().outfit.some((l) => l.itemId === itemId)) {
    if (useCloset.getState().busy) return;
    await takeOff(itemId);
    if (useCloset.getState().outfit.some((l) => l.itemId === itemId)) return; // re-dressing failed; error is shown
  }
  const r = await fetch(`/api/closet/${itemId}`, { method: "DELETE" }).catch(() => null);
  if (r?.ok || r?.status === 404) useCloset.getState().removeItem(itemId);
}

// ── Saved looks ──────────────────────────────────────────────────────────────

/** Is the current outfit already saved as a look? */
export function currentLookSaved(st: Pick<ClosetState, "outfit" | "looks"> = useCloset.getState()) {
  const top = st.outfit.at(-1);
  return !!top && st.looks.some((l) => sameIds(l.layers.at(-1)?.chain ?? [], top.chain));
}

/** Save the current outfit as a look (every layer photo, so it can be worn and edited again later). */
export async function saveLook() {
  const st = useCloset.getState();
  if (!st.outfit.length || currentLookSaved(st)) return;
  const title = (id: string) => st.items.find((i) => i.id === id)?.title ?? "Item";
  try {
    const { look } = await postJson<{ look: Look }>("/api/looks", {
      layers: st.outfit.map((l) => ({ ...l, title: title(l.itemId) })),
    });
    useCloset.setState((s) => ({ looks: [look, ...s.looks] }));
  } catch (e) {
    useCloset.setState({ outfitError: e instanceof Error ? e.message : String(e) });
  }
}

export async function deleteLook(id: string) {
  const r = await fetch(`/api/looks/${id}`, { method: "DELETE" }).catch(() => null);
  if (r?.ok || r?.status === 404) {
    useCloset.setState((s) => ({ looks: s.looks.filter((l) => l.id !== id), compareId: s.compareId === id ? null : s.compareId }));
  }
}

export const compareWith = (id: string | null) => useCloset.setState({ compareId: id });

/** Put a saved look back on: its layer photos are loaded, so nothing is re-generated. */
export async function wearLook(id: string) {
  const st = useCloset.getState();
  const look = st.looks.find((l) => l.id === id);
  if (!look || st.busy) return;
  useCloset.setState({ busy: "Putting the look back on…", outfitError: null });
  try {
    const layers = await Promise.all(
      look.layers.map(async (l, i): Promise<Layer> => {
        const blob = await fetch(lookImageUrl(look, i)).then((r) => r.blob());
        const image = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = () => rej(fr.error);
          fr.readAsDataURL(blob);
        });
        return { itemId: l.itemId, slot: l.slot, description: l.description, image, chain: l.chain };
      }),
    );
    useCloset.setState({ outfit: layers, compareId: null });
  } catch (e) {
    useCloset.setState({ outfitError: e instanceof Error ? e.message : String(e) });
  } finally {
    useCloset.setState({ busy: null });
  }
}

/** Draw the current outfit from four sides for the VR statue (Gemini pro image, ~20 s). */
export async function makeStatue() {
  const st = useCloset.getState();
  const top = st.outfit.at(-1);
  if (!top || st.statueBusy) return;
  useCloset.setState({ statueBusy: true, statueError: null });
  try {
    const { image } = await postJson<{ image: string }>("/api/statue", { image: top.image });
    useCloset.setState({ statue: { sheet: image, from: top.image } });
  } catch (e) {
    useCloset.setState({ statueError: e instanceof Error ? e.message : String(e) });
  } finally {
    useCloset.setState({ statueBusy: false });
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status}): the server or connection may be down.`);
  return data;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

/**
 * Orbis squashes any image to 832×480 without cropping, so every start image
 * is fitted to exactly 16:9 here: the image is placed whole ("contain") over a
 * blurred, zoomed copy of itself so nothing (like feet) is cut off.
 */
export async function fit16x9(dataUrl: string, width = 1664): Promise<Blob> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const W = width;
  const H = Math.round((W * 9) / 16);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const cover = Math.max(W / img.width, H / img.height);
  g.filter = "blur(24px)";
  g.drawImage(img, (W - img.width * cover) / 2, (H - img.height * cover) / 2, img.width * cover, img.height * cover);
  g.filter = "none";
  const contain = Math.min(W / img.width, H / img.height);
  g.drawImage(img, (W - img.width * contain) / 2, (H - img.height * contain) / 2, img.width * contain, img.height * contain);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), "image/jpeg", 0.92),
  );
}
