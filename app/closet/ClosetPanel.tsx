"use client";

import { useState } from "react";
import { fileToDataUrl, postJson, useCloset, type Item } from "../lib/closet";

type Props = { onWear: (item: Item) => void; canWear: boolean };

export function ClosetPanel({ onWear, canWear }: Props) {
  const { avatar, items, wearingId, addItem, updateItem, removeItem } = useCloset();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addFromUrl() {
    setAdding(true);
    setError(null);
    try {
      const r = await postJson<{ title: string; description: string; image: string; sourceUrl: string }>(
        "/api/ingest",
        { url },
      );
      addItem({ title: r.title, productImage: r.image, sourceUrl: r.sourceUrl });
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  function addFromText() {
    const t = text.trim();
    if (!t) return;
    addItem({ title: t.length > 60 ? `${t.slice(0, 57)}…` : t, text: t });
    setText("");
  }

  async function addFromPhoto(file: File) {
    addItem({ title: file.name.replace(/\.[^.]+$/, ""), productImage: await fileToDataUrl(file) });
  }

  async function dress(item: Item) {
    if (!avatar) return;
    updateItem(item.id, { status: "dressing", error: undefined });
    try {
      const r = await postJson<{ image: string; garmentDescription: string }>("/api/tryon", {
        avatarImage: avatar.image,
        garmentImage: item.productImage,
        garmentText: item.text,
        title: item.productImage ? item.title : undefined,
      });
      updateItem(item.id, { status: "dressed", tryOn: r });
    } catch (e) {
      updateItem(item.id, { status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <h2 className="text-[10px] uppercase tracking-wider text-zinc-500">2 · Closet</h2>

      <div className="mt-2 flex gap-1.5">
        <input
          id="product-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && url && addFromUrl()}
          placeholder="Paste a product link"
          className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm placeholder:text-zinc-600 focus:border-brand focus:outline-none"
        />
        <button
          onClick={addFromUrl}
          disabled={adding || !url.trim()}
          className="rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-200 hover:border-brand disabled:opacity-40"
        >
          {adding ? "…" : "Add"}
        </button>
      </div>

      <div className="mt-1.5 flex gap-1.5">
        <input
          id="garment-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addFromText()}
          placeholder="…or describe it: oversized cream wool coat"
          className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm placeholder:text-zinc-600 focus:border-brand focus:outline-none"
        />
        <button
          onClick={addFromText}
          disabled={!text.trim()}
          className="rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-200 hover:border-brand disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <label className="mt-1.5 flex cursor-pointer justify-center rounded-md border border-dashed border-zinc-700 px-2 py-1.5 text-xs text-zinc-500 hover:border-brand hover:text-brand">
        …or upload a product photo
        <input
          id="garment-photo"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) addFromPhoto(f);
            e.target.value = "";
          }}
        />
      </label>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <ul className="mt-3 flex flex-col gap-2">
        {items.length === 0 && (
          <li className="text-xs text-zinc-600">Nothing here yet. Add a link, a description or a photo.</li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            className={`flex gap-2 rounded-md border p-2 ${item.id === wearingId ? "border-brand" : "border-zinc-800"}`}
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-zinc-950">
              {(item.tryOn?.image ?? item.productImage) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.tryOn?.image ?? item.productImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center p-1 text-center text-[9px] text-zinc-600">text only</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-zinc-200" title={item.title}>
                {item.title}
              </p>
              {item.tryOn && (
                <p className="line-clamp-2 text-[10px] text-zinc-500">{item.tryOn.garmentDescription}</p>
              )}
              {item.error && <p className="line-clamp-2 text-[10px] text-red-400">{item.error}</p>}
              <div className="mt-1 flex gap-1">
                {item.status !== "dressed" && (
                  <button
                    onClick={() => dress(item)}
                    disabled={!avatar || item.status === "dressing"}
                    title={avatar ? undefined : "Create an avatar first"}
                    className="rounded bg-brand px-2 py-0.5 text-[10px] font-medium text-brand-fg disabled:opacity-40"
                  >
                    {item.status === "dressing" ? "Dressing… (~15 s)" : "Try on"}
                  </button>
                )}
                {item.status === "dressed" && (
                  <button
                    onClick={() => onWear(item)}
                    disabled={!canWear}
                    title={canWear ? undefined : "Connect the mirror first"}
                    className="rounded bg-brand px-2 py-0.5 text-[10px] font-medium text-brand-fg disabled:opacity-40"
                  >
                    {item.id === wearingId ? "Restart in mirror" : "Wear in mirror"}
                  </button>
                )}
                {item.status === "dressed" && (
                  <button
                    onClick={() => dress(item)}
                    className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-brand"
                  >
                    Redo
                  </button>
                )}
                <button
                  onClick={() => removeItem(item.id)}
                  className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-zinc-600 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
