"use client";

import { create } from "zustand";

// Client side of the director (see app/api/director): Gemini looks at the live
// frame and writes every follow-up prompt Orbis gets, and a watchdog checks the
// frame every few seconds and walks the double back to its mark if it drifts.

type DirectorState = {
  keepInPlace: boolean; // the watchdog is on
  lastCheck: { at: number; displaced: boolean; note: string } | null;
  corrections: number;
  reanchors: number; // times the video was restarted from the outfit photo to fix framing
  reanchoring: boolean;
  error: string | null;
};
export const useDirector = create<DirectorState>(() => ({
  keepInPlace: true,
  lastCheck: null,
  corrections: 0,
  reanchors: 0,
  reanchoring: false,
  error: null,
}));
export const setKeepInPlace = (on: boolean) => useDirector.setState({ keepInPlace: on });

// What the scene is right now, for Gemini's context.
let scene: { avatar: string; outfit: string[]; action: string; place?: string } | null = null;
export function setDirectorScene(avatar: string, outfit: string[], place?: string) {
  scene = { avatar, outfit, action: "standing on the spot, gently shifting their weight", place };
}
/** Where the double is (set by location steers), so a restart can keep the location. */
export function setDirectorPlace(place: string) {
  if (scene) scene.place = place;
}
export const directorPlace = () => scene?.place;
export function setDirectorAction(action: string) {
  if (scene) scene.action = action;
}

// The live video, as a JPEG (registered by ClosetApp from the Orbis track).
let frameSource: (() => string | null) | null = null;
export const registerFrameSource = (f: (() => string | null) | null) => {
  frameSource = f;
};

export type Reply = { prompt: string | null; displaced: boolean; severe?: boolean; note: string };

async function call(body: Record<string, unknown>, timeoutMs: number): Promise<Reply> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch("/api/director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, frame: frameSource?.() ?? undefined, ...scene }),
      signal: ctl.signal,
    });
    const j = (await r.json().catch(() => ({ error: `The server sent a page instead of data (${r.status}): it may be restarting or the connection dropped.` }))) as Reply & {
      error?: string;
    };
    if (!r.ok) throw new Error(j.error ?? `Director failed (${r.status})`);
    return j;
  } finally {
    clearTimeout(t);
  }
}

/** Gemini's prompt for a requested change (null → use the preset text as is). */
export async function directSteer(request: string): Promise<string | null> {
  if (!scene) return null;
  try {
    const r = await call({ mode: "steer", request }, 7000);
    useDirector.setState({ lastCheck: { at: Date.now(), displaced: r.displaced, note: r.note }, error: null });
    if (r.displaced) useDirector.setState((s) => ({ corrections: s.corrections + 1 }));
    return r.prompt;
  } catch (e) {
    useDirector.setState({ error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** Watchdog check of the live frame (null if it couldn't be checked). */
export async function checkInPlace(): Promise<Reply | null> {
  if (!scene || !frameSource?.()) return null;
  try {
    const r = await call({ mode: "check" }, 15000);
    useDirector.setState({ lastCheck: { at: Date.now(), displaced: r.displaced, note: r.note }, error: null });
    return r;
  } catch (e) {
    useDirector.setState({ error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
