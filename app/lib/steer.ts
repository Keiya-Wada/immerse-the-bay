"use client";

import { create } from "zustand";
import { sendSetPrompt, useViskoOrbisStable } from "./visko";
import { customPrompt, STEER_GAP_MS, type Steer } from "./closetPrompts";
import { directSteer, setDirectorAction, setDirectorPlace } from "./director";

// Live steering, shared by the 2D panel and the VR room.
//
// Orbis needs 2–4 s for a prompt to land, and prompts sent back to back blur
// together, so changes go out at least STEER_GAP_MS apart. Instead of ignoring
// presses during that gap (which felt like broken buttons), the latest press is
// queued and sent as soon as the gap is over. Errors are kept and shown.

type Orbis = ReturnType<typeof useViskoOrbisStable>;
// text: the fallback prompt; direct: let Gemini rewrite it from the live frame first.
type Job = { text: string; label: string; direct: boolean; place?: string };

type SteerState = {
  sending: string | null; // label being sent (waiting out the gap or for the ack)
  queued: string | null; // label of the next change, if one is waiting
  last: { label: string; at: number } | null; // last change Orbis accepted
  error: string | null;
};

export const useSteerState = create<SteerState>(() => ({ sending: null, queued: null, last: null, error: null }));

let lastSent = 0;
/** For the keep-in-place watchdog: is a change in flight, and when was the last one sent? */
export const steerIdle = () => ({ busy, since: Date.now() - lastSent });
/** Called when a new outfit starts playing, so the watchdog gives Orbis time to settle. */
export const markPromptSent = () => {
  lastSent = Date.now();
};
let next: Job | null = null;
let busy = false;

async function pump(s: Orbis) {
  if (busy) return;
  busy = true;
  try {
    while (next) {
      const job = next;
      next = null;
      useSteerState.setState({ sending: job.label, queued: null });
      const wait = lastSent + STEER_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        // Gemini rewrites the prompt from the live frame (keeping the person on their
        // mark, and walking them back first if they've drifted). Falls back to the preset.
        const text = (job.direct && (await directSteer(job.text))) || job.text;
        lastSent = Date.now();
        await sendSetPrompt(s, text);
        setDirectorAction(job.label === "Back to centre" ? "standing on the spot facing forward" : job.text);
        if (job.place) setDirectorPlace(job.place);
        useSteerState.setState({ last: { label: job.label, at: Date.now() }, error: null });
      } catch (e) {
        useSteerState.setState({ error: `${job.label}: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
  } finally {
    busy = false;
    useSteerState.setState({ sending: null, queued: null });
  }
}

// While the headset is in an immersive session, the page's visibility doesn't
// mean "the user left"; the XR session reports that instead (see VRRoom).
let inXR = false;
export const setInXR = (v: boolean) => {
  inXR = v;
};
export const isInXR = () => inXR;

export function useSteer() {
  const s = useViskoOrbisStable();
  const state = useSteerState();

  /** A preset (pose or place), free text (2D panel / voice), or a ready-made correction. */
  function steer(st: Steer | { label: string; custom: string } | { label: string; raw: string }) {
    const text = "raw" in st ? st.raw : "custom" in st ? customPrompt(st.custom) : st.text;
    const label = st.label;
    next = { text, label, direct: !("raw" in st), place: "place" in st ? st.place : undefined };
    if (busy) useSteerState.setState({ queued: label });
    void pump(s);
  }

  return { steer, ...state };
}
