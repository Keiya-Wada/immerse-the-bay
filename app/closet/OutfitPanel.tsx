"use client";

import { clearOutfit, currentLookSaved, makeStatue, photoSeconds, redoLast, saveLook, setQuality, takeOff, useCloset, type Layer } from "../lib/closet";

type Props = { onWear: (outfit: Layer[]) => void; canWear: boolean };

export function OutfitPanel({ onWear, canWear }: Props) {
  const { avatar, items, outfit, busy, outfitError, wornImage, looks, quality, statue, statueBusy, statueError } = useCloset();
  const saved = currentLookSaved({ outfit, looks });
  const top = outfit.at(-1);
  const inMirror = !!top && top.image === wornImage;
  const title = (id: string) => items.find((i) => i.id === id)?.title ?? "Item";

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[10px] uppercase tracking-wider text-zinc-500">3 · Outfit</h2>
        <div className="flex items-center gap-1 text-[10px]" title="Which Gemini model makes the try-on photos">
          <span className="text-zinc-600">Photos</span>
          {(["fast", "best"] as const).map((q) => (
            <button
              key={q}
              onClick={() => setQuality(q)}
              className={`rounded px-1.5 py-0.5 ${quality === q ? "bg-brand font-medium text-brand-fg" : "border border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}
            >
              {q === "fast" ? "Fast" : "Best quality"}
            </button>
          ))}
        </div>
      </div>

      {!top ? (
        <p className="mt-2 text-xs text-zinc-600">
          {avatar
            ? "Try on something from the closet, then keep adding pieces to build an outfit."
            : "Create an avatar first."}
        </p>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={top.image} alt="Current outfit" className="mt-2 aspect-video w-full rounded-md object-cover" />
          <ul className="mt-2 flex flex-col gap-1">
            {outfit.map((l) => (
              <li key={l.itemId} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-[9px] uppercase tracking-wider text-zinc-500">{l.slot}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-300" title={l.description}>
                  {title(l.itemId)}
                </span>
                <button
                  onClick={() => takeOff(l.itemId)}
                  disabled={!!busy}
                  className="text-[10px] text-zinc-600 hover:text-red-400 disabled:opacity-40"
                >
                  Take off
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {top && (
        <div className="mt-2 rounded-md border border-zinc-800 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-zinc-400">
              3D statue <span className="text-zinc-600">· walk around it in VR (it stands behind you)</span>
            </p>
            <button
              onClick={makeStatue}
              disabled={statueBusy}
              className="shrink-0 rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200 hover:border-brand disabled:opacity-40"
            >
              {statueBusy ? "Drawing… ~20 s" : statue && statue.from === top.image ? "Make again" : "Make statue"}
            </button>
          </div>
          {statueError && <p className="mt-1 text-[11px] text-red-400">{statueError}</p>}
          {statue && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={statue.sheet} alt="Front, sides and back" className="mt-1.5 aspect-video w-full rounded object-cover" />
          )}
        </div>
      )}

      {busy && <p className="mt-2 text-xs text-brand">{busy} (~{photoSeconds(quality)} s each)</p>}
      {outfitError && <p className="mt-2 text-xs text-red-400">{outfitError}</p>}

      {top && (
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={() => onWear(outfit)}
            disabled={!canWear || !!busy}
            title={canWear ? undefined : "Connect the mirror first"}
            className="flex-1 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
          >
            {inMirror ? "Restart in mirror" : wornImage ? "Update mirror" : "Wear in mirror"}
          </button>
          <button
            onClick={saveLook}
            disabled={!!busy || saved}
            title="Keep a snapshot of this outfit to compare with later"
            className="rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-300 hover:border-brand disabled:opacity-40"
          >
            {saved ? "Saved ✓" : "Save look"}
          </button>
          <button
            onClick={redoLast}
            disabled={!!busy}
            title="Generate the last item again"
            className="rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-300 hover:border-brand disabled:opacity-40"
          >
            Redo last
          </button>
          <button
            onClick={clearOutfit}
            disabled={!!busy}
            className="rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-400 hover:border-red-400 hover:text-red-400 disabled:opacity-40"
          >
            Start over
          </button>
        </div>
      )}
    </section>
  );
}
