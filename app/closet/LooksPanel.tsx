"use client";

import { compareWith, deleteLook, lookImageUrl, lookTitle, useCloset, wearLook, type Look } from "../lib/closet";

const when = (t: number) =>
  new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Saved looks: tap one to compare it with what you have on now. */
export function LooksPanel() {
  const { looks, compareId } = useCloset();
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <h2 className="text-[10px] uppercase tracking-wider text-zinc-500">4 · Saved looks ({looks.length})</h2>
      {looks.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-600">Press Save look on an outfit to keep it here and compare it later.</p>
      ) : (
        <ul className="mt-2 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
          {looks.map((look) => (
            <li key={look.id}>
              <button
                onClick={() => compareWith(compareId === look.id ? null : look.id)}
                title={lookTitle(look)}
                className={`w-full overflow-hidden rounded-md border text-left ${
                  compareId === look.id ? "border-brand" : "border-zinc-800 hover:border-zinc-600"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lookImageUrl(look)} alt={lookTitle(look)} loading="lazy" className="aspect-video w-full object-cover" />
                <p className="line-clamp-2 px-1.5 pt-1 text-[10px] leading-tight text-zinc-300">{lookTitle(look)}</p>
                <p className="px-1.5 pb-1 text-[9px] text-zinc-600">
                  {compareId === look.id ? "Comparing · tap to close" : when(look.createdAt)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The saved look shown next to the live video (or the current outfit photo). */
export function ComparePane({ look }: { look: Look }) {
  const busy = useCloset((s) => s.busy);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[11px] uppercase tracking-wider text-zinc-500">
          Saved {when(look.createdAt)} · <span className="normal-case tracking-normal text-zinc-300">{lookTitle(look)}</span>
        </p>
        <button onClick={() => compareWith(null)} className="shrink-0 text-[11px] text-zinc-500 hover:text-zinc-200">
          Close ✕
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={lookImageUrl(look)} alt={lookTitle(look)} className="min-h-0 w-full flex-1 rounded-md bg-black object-contain" />
      <div className="flex gap-1.5">
        <button
          onClick={() => wearLook(look.id)}
          disabled={!!busy}
          className="flex-1 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
        >
          Put this look back on
        </button>
        <button
          onClick={() => deleteLook(look.id)}
          className="rounded-md border border-zinc-700 px-2.5 text-xs text-red-400 hover:border-red-400"
        >
          Delete look
        </button>
      </div>
    </div>
  );
}
