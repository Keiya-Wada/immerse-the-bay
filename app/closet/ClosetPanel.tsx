"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORIES,
  addToCloset,
  deleteItem,
  editItem,
  fileToDataUrl,
  itemImageUrl,
  postJson,
  putOn,
  takeOff,
  useCloset,
  type Item,
  type Slot,
} from "../lib/closet";

// The saved closet: add clothes once (photos, a product link, or a description),
// then browse by category and type ("all my shirts") and throw something on.
// Items are saved on the server, so they're here after a reload and on the Quest.

type Tab = Slot | "all" | "unsorted";

export function ClosetPanel() {
  const { loaded, avatar, items, pending, addError, outfit, busy } = useCloset();
  const wearing = useMemo(() => new Set(outfit.map((l) => l.itemId)), [outfit]);
  const [tab, setTab] = useState<Tab>("all");
  const [kind, setKind] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [dragging, setDragging] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, unsorted: 0 };
    for (const i of items) c[i.slot ?? "unsorted"] = (c[i.slot ?? "unsorted"] ?? 0) + 1;
    return c;
  }, [items]);

  const inTab = items.filter((i) => tab === "all" || (tab === "unsorted" ? !i.slot : i.slot === tab));
  const kinds = useMemo(() => {
    const k = new Map<string, number>();
    for (const i of inTab) if (i.kind) k.set(i.kind, (k.get(i.kind) ?? 0) + 1);
    return [...k.entries()].sort((a, b) => b[1] - a[1]);
  }, [inTab]);
  const q = query.trim().toLowerCase();
  const shown = inTab.filter(
    (i) =>
      (!kind || i.kind === kind) &&
      (!q || [i.title, i.kind, i.garmentDescription, i.text].some((t) => t?.toLowerCase().includes(q))),
  );

  // Paste an image anywhere on the page (e.g. "Copy image" on a store site, or a screenshot) to add it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const empty = loaded && items.length === 0 && pending.length === 0;
  // An empty closet opens the add form, and it stays open while you add (until "Done adding").
  useEffect(() => {
    if (empty) setShowAdd(true);
  }, [empty]);

  return (
    <section
      className={`rounded-lg border bg-zinc-900/40 p-3 ${dragging ? "border-brand" : "border-zinc-800"}`}
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === "file")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-wider text-zinc-500">
          2 · Closet{items.length > 0 && <span className="ml-1 text-zinc-600">({items.length})</span>}
        </h2>
        {items.length > 0 && (
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:border-brand hover:text-brand"
          >
            {showAdd ? "Done adding" : "+ Add clothes"}
          </button>
        )}
      </div>

      {showAdd && <AddClothes />}
      {addError && <p className="mt-2 text-xs text-red-400">{addError}</p>}

      {!loaded && <p className="mt-3 text-xs text-zinc-600">Opening your closet…</p>}

      {items.length > 0 && (
        <>
          <input
            id="closet-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your closet: linen, navy, boots…"
            className="mt-3 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs placeholder:text-zinc-600 focus:border-brand focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            <Chip on={tab === "all"} onClick={() => (setTab("all"), setKind(null))} label="All" n={counts.all} />
            {CATEGORIES.filter((c) => counts[c.slot]).map((c) => (
              <Chip key={c.slot} on={tab === c.slot} onClick={() => (setTab(c.slot), setKind(null))} label={c.label} n={counts[c.slot]} />
            ))}
            {counts.unsorted > 0 && (
              <Chip on={tab === "unsorted"} onClick={() => (setTab("unsorted"), setKind(null))} label="Unsorted" n={counts.unsorted} />
            )}
          </div>
          {kinds.length > 1 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {kinds.map(([k, n]) => (
                <button
                  key={k}
                  onClick={() => setKind(kind === k ? null : k)}
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    kind === k ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {plural(k, n)}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {(shown.length > 0 || pending.length > 0) && (
        <ul className="mt-2 grid max-h-[26rem] grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
          {pending.map((p) => (
            <li key={p.key} className="overflow-hidden rounded-md border border-dashed border-zinc-700">
              <div className="relative aspect-square bg-zinc-950">
                {p.preview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.preview} alt="" className="h-full w-full object-contain opacity-40" />
                )}
                <span className="absolute inset-0 grid place-items-center text-[10px] text-brand">Sorting…</span>
              </div>
              <p className="truncate px-1.5 py-1 text-[10px] text-zinc-500">{p.title}</p>
            </li>
          ))}
          {shown.map((item) => (
            <ItemCard key={item.id} item={item} on={wearing.has(item.id)} anyOn={outfit.length > 0} busy={busy} hasAvatar={!!avatar} />
          ))}
        </ul>
      )}
      {items.length > 0 && shown.length === 0 && (
        <p className="mt-3 text-xs text-zinc-600">Nothing here{q ? ` matching “${query}”` : ""}.</p>
      )}
      {!avatar && items.length > 0 && <p className="mt-2 text-[11px] text-zinc-600">Create an avatar to try things on.</p>}
    </section>
  );
}

// "shirt 1", "shirts 3", "jeans 2", "watches 2"
function plural(k: string, n: number) {
  const word = n === 1 || /s$/.test(k) ? k : /(sh|ch|x)$/.test(k) ? `${k}es` : `${k}s`;
  return `${word} ${n}`;
}

function Chip({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n?: number }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2 py-0.5 text-[11px] ${
        on ? "border-brand bg-brand text-brand-fg" : "border-zinc-800 text-zinc-300 hover:border-brand"
      }`}
    >
      {label}
      {n ? <span className={on ? "ml-1 opacity-70" : "ml-1 text-zinc-600"}>{n}</span> : null}
    </button>
  );
}

function ItemCard({ item, on, anyOn, busy, hasAvatar }: { item: Item; on: boolean; anyOn: boolean; busy: string | null; hasAvatar: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false); // remove takes two taps
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);
  const src = itemImageUrl(item);
  return (
    <li className={`group relative flex flex-col overflow-hidden rounded-md border ${on ? "border-brand" : "border-zinc-800"}`}>
      <button
        onClick={() => (on ? takeOff(item.id) : putOn(item.id))}
        disabled={!!busy || (!on && !hasAvatar)}
        title={item.garmentDescription ?? item.title}
        className="relative aspect-square bg-white disabled:cursor-not-allowed"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={item.title} loading="lazy" className="h-full w-full object-contain" />
        ) : (
          <span className="grid h-full place-items-center bg-zinc-950 p-2 text-center text-[10px] leading-snug text-zinc-400">
            {item.text ?? item.title}
          </span>
        )}
        <span
          className={`absolute inset-x-0 bottom-0 py-0.5 text-center text-[10px] font-medium ${
            on ? "bg-brand text-brand-fg" : "bg-black/70 text-zinc-100 opacity-0 group-hover:opacity-100"
          }`}
        >
          {on ? "Wearing · take off" : anyOn ? "Add to outfit" : "Try on"}
        </span>
      </button>
      <button
        onClick={() => (confirm ? deleteItem(item.id) : setConfirm(true))}
        disabled={on && !!busy}
        title="Remove from closet"
        aria-label={confirm ? "Confirm remove" : "Remove from closet"}
        className={`absolute right-1 top-1 rounded-full text-[10px] font-medium leading-none shadow disabled:opacity-40 ${
          confirm ? "bg-red-500 px-2 py-1 text-white" : "h-5 w-5 bg-black/60 text-zinc-200 hover:bg-red-500"
        }`}
      >
        {confirm ? "Remove?" : "✕"}
      </button>
      <div className="flex items-start gap-1 px-1.5 py-1">
        <p className="line-clamp-2 flex-1 text-[10px] leading-tight text-zinc-300" title={item.title}>
          {item.title}
        </p>
        <button
          onClick={() => setEditing((v) => !v)}
          title="Edit"
          className="shrink-0 rounded px-0.5 text-[11px] leading-none text-zinc-600 hover:text-zinc-200"
        >
          ⋯
        </button>
      </div>
      {item.error && <p className="line-clamp-2 px-1.5 pb-1 text-[9px] text-red-400">{item.error}</p>}
      {editing && <EditItem item={item} on={on} busy={busy} onDone={() => setEditing(false)} />}
    </li>
  );
}

function EditItem({ item, on, busy, onDone }: { item: Item; on: boolean; busy: string | null; onDone: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [kind, setKind] = useState(item.kind ?? "");
  return (
    <div className="absolute inset-0 z-10 flex flex-col gap-1 bg-zinc-950/95 p-1.5 text-[10px]">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-200"
        aria-label="Name"
      />
      <select
        value={item.slot ?? ""}
        onChange={(e) => editItem(item.id, { slot: e.target.value as Slot })}
        className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-200"
        aria-label="Category"
      >
        {!item.slot && <option value="">Unsorted</option>}
        {CATEGORIES.map((c) => (
          <option key={c.slot} value={c.slot}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        placeholder="type: shirt, jeans…"
        className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-200 placeholder:text-zinc-600"
        aria-label="Type"
      />
      <div className="mt-auto flex gap-1">
        <button
          onClick={() => {
            editItem(item.id, { title, kind });
            onDone();
          }}
          className="flex-1 rounded bg-brand py-0.5 font-medium text-brand-fg"
        >
          Save
        </button>
        <button
          onClick={() => deleteItem(item.id)}
          disabled={on && !!busy}
          className="rounded border border-zinc-700 px-1.5 py-0.5 text-red-400 hover:border-red-400 disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

async function addFiles(files: File[]) {
  // One at a time keeps the order and stays under Gemini's rate limit.
  for (const f of files) {
    await addToCloset({ title: f.name.replace(/\.[^.]+$/, ""), image: await fileToDataUrl(f) });
  }
}

function AddClothes() {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFromUrl() {
    setFetching(true);
    setError(null);
    try {
      const r = await postJson<{ title: string; image: string; sourceUrl: string }>("/api/ingest", { url });
      setUrl("");
      await addToCloset({ title: r.title, image: r.image, sourceUrl: r.sourceUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }

  function addFromText() {
    const t = text.trim();
    if (!t) return;
    setText("");
    addToCloset({ text: t });
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <button
        onClick={() => fileRef.current?.click()}
        className="rounded-md border border-dashed border-zinc-600 px-2 py-3 text-xs text-zinc-300 hover:border-brand hover:text-brand"
      >
        <span className="font-medium">Add photos of your clothes</span>
        <span className="mt-0.5 block text-[10px] text-zinc-500">
          Pick several at once, drop them here, or paste a copied image (⌘V). On a phone you can take photos.
        </span>
      </button>
      <input
        ref={fileRef}
        id="garment-photos"
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          addFiles(files);
        }}
      />
      <div className="flex gap-1.5">
        <input
          id="product-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && url.trim() && addFromUrl()}
          placeholder="…or paste a product link"
          className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs placeholder:text-zinc-600 focus:border-brand focus:outline-none"
        />
        <button
          onClick={addFromUrl}
          disabled={fetching || !url.trim()}
          className="rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-200 hover:border-brand disabled:opacity-40"
        >
          {fetching ? "…" : "Add"}
        </button>
      </div>
      <div className="flex gap-1.5">
        <input
          id="garment-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addFromText()}
          placeholder="…or describe it: oversized cream wool coat"
          className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs placeholder:text-zinc-600 focus:border-brand focus:outline-none"
        />
        <button
          onClick={addFromText}
          disabled={!text.trim()}
          className="rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-200 hover:border-brand disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
