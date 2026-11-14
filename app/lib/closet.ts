"use client";

import { create } from "zustand";

// Client-side state for the closet: the avatar, the clothing items, and which
// item the mirror is showing. Kept in memory only (images are large data URLs);
// a page reload starts fresh.

export type Avatar = { description: string; image: string };

export type Item = {
  id: string;
  title: string;
  sourceUrl?: string;
  productImage?: string; // data URL
  text?: string; // description typed by the user
  status: "ready" | "dressing" | "dressed" | "error";
  error?: string;
  tryOn?: { image: string; garmentDescription: string };
};

type ClosetState = {
  avatar: Avatar | null;
  items: Item[];
  wearingId: string | null;
  setAvatar: (a: Avatar | null) => void;
  addItem: (i: Omit<Item, "id" | "status">) => string;
  updateItem: (id: string, patch: Partial<Item>) => void;
  removeItem: (id: string) => void;
  setWearing: (id: string | null) => void;
};

export const useCloset = create<ClosetState>((set) => ({
  avatar: null,
  items: [],
  wearingId: null,
  // A new avatar invalidates every try-on image.
  setAvatar: (avatar) =>
    set((s) => ({
      avatar,
      wearingId: null,
      items: s.items.map((i) => ({ ...i, status: "ready", tryOn: undefined, error: undefined })),
    })),
  addItem: (i) => {
    const id = Math.random().toString(36).slice(2, 10);
    set((s) => ({ items: [{ ...i, id, status: "ready" }, ...s.items] }));
    return id;
  },
  updateItem: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
  removeItem: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id), wearingId: s.wearingId === id ? null : s.wearingId })),
  setWearing: (wearingId) => set({ wearingId }),
}));

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status})`);
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
