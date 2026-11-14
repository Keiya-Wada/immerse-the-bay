"use client";

import { useEffect, useRef, useState } from "react";
import { sendPause, sendResume, sendSetPrompt, useViskoOrbisStable } from "../lib/visko";
import { PLACE_STEERS, POSE_STEERS, STEER_GAP_MS, type Steer } from "../lib/closetPrompts";

// Live steering. One change at a time, at least STEER_GAP_MS apart, because
// Orbis needs 2–4 s for a prompt to land and queued prompts blur together.
export function SteerPanel({ running, paused }: { running: boolean; paused: boolean }) {
  const s = useViskoOrbisStable();
  const [pending, setPending] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const lastSent = useRef(0);

  async function steer(text: string, label: string) {
    const wait = lastSent.current + STEER_GAP_MS - Date.now();
    setPending(label);
    try {
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastSent.current = Date.now();
      await sendSetPrompt(s, text);
      await new Promise((r) => setTimeout(r, 1500)); // let the morph start before unlocking
    } finally {
      setPending(null);
    }
  }

  // Save credits: pause when the tab is hidden or the headset is taken off.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && running) sendPause(s).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [running, s]);

  const disabled = !running || pending !== null;
  const btn = (st: Steer) => (
    <button
      key={st.label}
      onClick={() => steer(st.text, st.label)}
      disabled={disabled}
      title={st.text}
      className={`rounded-md border px-2 py-1 text-xs ${
        pending === st.label ? "border-brand text-brand" : "border-zinc-800 text-zinc-300 hover:border-brand"
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
      {pending && <p className="mt-1 text-[11px] text-brand">Changing: {pending}… lands in 2–4 s</p>}
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
              steer(custom.trim(), "custom");
              setCustom("");
            }
          }}
          placeholder="The person walks into a snowy park…"
          className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs placeholder:text-zinc-600 focus:border-brand focus:outline-none"
        />
        <button
          onClick={() => {
            steer(custom.trim(), "custom");
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
