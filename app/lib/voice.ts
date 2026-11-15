"use client";

import { create } from "zustand";
import { dressOutfit, postJson, putOn, saveLook, takeOffMany, useCloset } from "./closet";
import type { VoiceIntent } from "./voiceIntent";

// Push-to-talk voice commands, shared by the page and the VR room.
//
//   hold (button / controller A or X)  →  record from the mic
//   release                           →  WAV → /api/voice (Gemini transcribes and
//                                         maps it onto the closet / steer presets)
//                                      →  carried out here: dress the outfit, steer, save…
//
// The mic stream is opened on the first press and kept open, so later presses
// don't clip the first word. On the Quest, allow the mic once on the page before
// entering VR (the permission prompt may not show inside the headset).

type VoiceState = {
  phase: "idle" | "listening" | "thinking";
  transcript: string | null;
  result: string | null; // what we did, in words
  error: string | null;
};
export const useVoice = create<VoiceState>(() => ({ phase: "idle", transcript: null, result: null, error: null }));

/** What the app does with an understood command (registered by ClosetApp). */
export type VoiceActions = {
  steer: (label: string, custom?: string) => void;
  pause: () => void;
  resume: () => void;
  /** Called after voice changed the outfit: show it on the live video if it's running. */
  outfitChanged: () => void;
  steerLabels: { poses: string[]; places: string[] };
};
let actions: VoiceActions | null = null;
export const registerVoiceActions = (a: VoiceActions | null) => {
  actions = a;
};

let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startedAt = 0;

export async function voiceStart() {
  if (useVoice.getState().phase !== "idle") return;
  try {
    stream ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    useVoice.setState({ error: "Microphone blocked. Allow the mic for this site (on the Quest: on the page, before entering VR)." });
    return;
  }
  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();
  startedAt = performance.now();
  useVoice.setState({ phase: "listening", error: null, result: null, transcript: null });
}

export async function voiceStop() {
  const rec = recorder;
  if (!rec || useVoice.getState().phase !== "listening") return;
  recorder = null;
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.stop();
  await stopped;
  if (performance.now() - startedAt < 400) {
    useVoice.setState({ phase: "idle", error: "Hold the button while you speak." });
    return;
  }
  useVoice.setState({ phase: "thinking" });
  try {
    const audio = await toWav(new Blob(chunks, { type: rec.mimeType }));
    const st = useCloset.getState();
    const { transcript, intent } = await postJson<{ transcript: string; intent: VoiceIntent }>("/api/voice", {
      audio,
      outfit: st.outfit.map((l) => l.itemId),
      steers: actions?.steerLabels ?? { poses: [], places: [] },
    });
    useVoice.setState({ transcript, phase: "idle" });
    await carryOut(intent);
  } catch (e) {
    useVoice.setState({ phase: "idle", error: e instanceof Error ? e.message : String(e) });
  }
}

const say = (result: string) => useVoice.setState({ result });

async function carryOut(intent: VoiceIntent) {
  const items = useCloset.getState().items;
  const names = (ids: string[]) => ids.map((id) => items.find((i) => i.id === id)?.title ?? "item").join(", ");
  switch (intent.kind) {
    case "outfit": {
      const missing = intent.missing.length ? ` Not in your closet: ${intent.missing.join(", ")}.` : "";
      if (!intent.itemIds.length) return say(`Couldn't find that in your closet.${missing}`);
      if (!useCloset.getState().avatar) return say("Create your avatar first.");
      if (useCloset.getState().busy) return say("Still dressing. Try again in a moment.");
      if (intent.mode === "remove") {
        say(`Taking off ${names(intent.itemIds)}…`);
        await takeOffMany(intent.itemIds);
      } else if (intent.mode === "add") {
        say(`Adding ${names(intent.itemIds)}…${missing}`);
        for (const id of intent.itemIds) await putOn(id);
      } else {
        say(`Putting on ${names(intent.itemIds)}…${missing}`);
        await dressOutfit(intent.itemIds);
      }
      const err = useCloset.getState().outfitError;
      say(err ? `Couldn't finish: ${err}` : `Done: ${names(useCloset.getState().outfit.map((l) => l.itemId))}.${missing}`);
      if (!err) actions?.outfitChanged();
      return;
    }
    case "pose":
    case "place":
      say(intent.label);
      return actions?.steer(intent.label);
    case "custom":
      say(intent.text);
      return actions?.steer("custom", intent.text);
    case "save_look":
      await saveLook();
      return say("Saved this look.");
    case "pause":
      actions?.pause();
      return say("Paused.");
    case "resume":
      actions?.resume();
      return say("Resumed.");
    default:
      return say(intent.reply || "Sorry, I didn't catch that.");
  }
}

/** Any recording → 16 kHz mono WAV data URL (a format Gemini reads everywhere). */
async function toWav(blob: Blob): Promise<string> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  void ctx.close();
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const text = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  out.setUint32(4, 36 + pcm.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, 1, true); // mono
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  text(36, "data");
  out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  const bytes = new Uint8Array(out.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  Object.assign(window, { __voice: { useVoice, carryOut, toWav } }); // for headless tests
}
