"use client";

import { useEffect, useState } from "react";
import { sendPause, sendResume, useViskoOrbisStable } from "../lib/visko";
import { PLACE_STEERS, POSE_STEERS, type Steer } from "../lib/closetPrompts";
import { isInXR, useSteer } from "../lib/steer";
import { setKeepInPlace, useDirector } from "../lib/director";

// Live steering buttons (2D). The rate limiting lives in useSteer.
export function SteerPanel({ running, paused }: { running: boolean; paused: boolean }) {
  const s = useViskoOrbisStable();
  const { steer, sending, queued, error } = useSteer();
  const director = useDirector();
  const [custom, setCustom] = useState("");

  const disabled = !running; // presses during a change are queued, not ignored
  const btn = (st: Steer) => (
    <button
      key={st.label}
      onClick={() => steer(st)}
      disabled={disabled}
      title={st.text}
      className={`rounded-md border px-2 py-1 text-xs ${
        sending === st.label || queued === st.label ? "border-brand text-brand" : "border-zinc-800 text-zinc-300 hover:border-brand"
      } disabled:opacity-40`}
    >
      {st.label}
    </button>
  );

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-wider text-zinc-500">3 · Steer the mirror</h2>
        {(running || paused) && (
          <button
            onClick={() => (paused ? sendResume(s) : sendPause(s))}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:border-brand"
          >
            {paused ? "Resume" : "Pause (saves credits)"}
          </button>
        )}
      </div>
      {sending && (
        <p className="mt-1 text-[11px] text-brand">
          Changing: {sending}… lands in 2–4 s{queued && queued !== sending ? ` · next: ${queued}` : ""}
        </p>
      )}
      {error && <p className="mt-1 text-[11px] text-red-400">Didn&apos;t send ({error})</p>}
      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
        <label className="flex items-center gap-1.5 text-zinc-400" title="Gemini checks the video every 8 s and walks the double back to its spot if it drifts; it also writes every steer prompt">
          <input type="checkbox" checked={director.keepInPlace} onChange={(e) => setKeepInPlace(e.target.checked)} className="accent-amber-500" />
          Keep in place
        </label>
        <span className={director.error ? "text-red-400" : director.lastCheck?.displaced ? "text-brand" : "text-zinc-600"}>
          {director.reanchoring
            ? "Restarting the video to re-centre…"
            : director.error
            ? director.error
            : director.lastCheck
              ? `${director.lastCheck.displaced ? "Drifted, moving back" : "On its mark"}: ${director.lastCheck.note} · ${director.corrections} nudges, ${director.reanchors} restarts`
              : running
                ? "Watching…"
                : ""}
        </span>
      </div>
      <p className="mt-2 text-[10px] text-zinc-600">Pose</p>
      <div className="mt-1 flex flex-wrap gap-1.5">{POSE_STEERS.map(btn)}</div>
      <p className="mt-2 text-[10px] text-zinc-600">Take it somewhere</p>
      <div className="mt-1 flex flex-wrap gap-1.5">{PLACE_STEERS.map(btn)}</div>
      <div className="mt-2 flex gap-1.5">
        <input
          id="custom-steer"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim() && !disabled) {
              steer({ label: "custom", custom: custom.trim() });
              setCustom("");
            }
          }}
          placeholder="They stand in a snowy park, laughing…"
          className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs placeholder:text-zinc-600 focus:border-brand focus:outline-none"
        />
        <button
          onClick={() => {
            steer({ label: "custom", custom: custom.trim() });
            setCustom("");
          }}
          disabled={disabled || !custom.trim()}
          className="rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-200 hover:border-brand disabled:opacity-40"
        >
          Send
        </button>
      </div>
      {!running && !paused && (
        <p className="mt-2 text-[11px] text-zinc-600">Wear an item in the mirror to start steering.</p>
      )}
    </section>
  );
}
