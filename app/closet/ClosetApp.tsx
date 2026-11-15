"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ViskoOrbisStableProvider } from "@reactor-models/visko-orbis-stable";
import { fetchToken } from "../lib/token";
import { fit16x9, loadCloset, postJson, useCloset, type Layer } from "../lib/closet";
import { initialPrompt, PLACE_STEERS, POSE_STEERS } from "../lib/closetPrompts";
import { markPromptSent, steerIdle, useSteer } from "../lib/steer";
import { checkInPlace, directorPlace, registerFrameSource, setDirectorScene, useDirector } from "../lib/director";
import { registerVoiceActions } from "../lib/voice";
import { VoiceBar } from "./VoiceBar";
import {
  sendPause,
  sendReset,
  sendResume,
  sendSetAudioEnabled,
  sendSetResolution,
  sendSetImage,
  sendSetPrompt,
  sendStart,
  useVideoTrack,
  useViskoOrbisStable,
  useViskoState,
  type StateMessage,
} from "../lib/visko";
import { StatusBadge } from "../components/StatusBadge";
import { Video } from "../components/Video";
import { AvatarPanel } from "./AvatarPanel";
import { ClosetPanel } from "./ClosetPanel";
import { OutfitPanel } from "./OutfitPanel";
import { ComparePane, LooksPanel } from "./LooksPanel";
import { SteerPanel } from "./SteerPanel";

// three.js + WebXR only load in the browser.
const VRRoom = dynamic(() => import("../vr/VRRoom"), { ssr: false });

export function ClosetApp() {
  return (
    <ViskoOrbisStableProvider jwtToken={fetchToken}>
      <Closet />
    </ViskoOrbisStableProvider>
  );
}

function Closet() {
  const s = useViskoOrbisStable();
  const avatar = useCloset((st) => st.avatar);
  const setWorn = useCloset((st) => st.setWorn);
  const comparing = useCloset((st) => st.looks.find((l) => l.id === st.compareId));
  const nowImage = useCloset((st) => st.outfit.at(-1)?.image);
  const [snap, setSnap] = useState<StateMessage | null>(null);
  const [wearError, setWearError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  useViskoState((m: StateMessage) => setSnap(m));

  // The closet and avatar are saved on the server: load them once on open.
  useEffect(() => {
    loadCloset().catch(() => useCloset.setState({ loaded: true, addError: "Couldn't open the saved closet." }));
  }, []);

  const ready = s.status === "ready";

  // Voice commands: what "turn around", "pause" or a new outfit should do here.
  const { steer } = useSteer();
  const live = useRef({ canWear: false, wear: (_o: Layer[], _p?: { image?: string; place?: string }) => {}, steer });
  live.current = { canWear: ready && !switching, wear, steer };
  useEffect(() => {
    const all = [...POSE_STEERS, ...PLACE_STEERS];
    registerVoiceActions({
      steerLabels: { poses: POSE_STEERS.map((x) => x.label), places: PLACE_STEERS.map((x) => x.label) },
      steer: (label, custom) => {
        const preset = all.find((x) => x.label === label);
        if (custom) live.current.steer({ label: "voice", custom });
        else if (preset) live.current.steer(preset);
      },
      pause: () => void sendPause(s).catch(() => undefined),
      resume: () => void sendResume(s).catch(() => undefined),
      // A new outfit from voice goes straight onto the live video when it's connected.
      outfitChanged: () => {
        const outfit = useCloset.getState().outfit;
        if (live.current.canWear && outfit.length) live.current.wear(outfit);
      },
    });
    return () => registerVoiceActions(null);
  }, [s]);

  // The live frame, for the director (Gemini looks at it before every prompt).
  const track = useVideoTrack();
  useEffect(() => {
    if (!track) return registerFrameSource(null);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = new MediaStream([track]);
    Object.assign(v.style, { position: "fixed", left: "0", top: "0", width: "2px", height: "2px", opacity: "0.01", pointerEvents: "none" });
    document.body.appendChild(v);
    void v.play().catch(() => undefined);
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 360;
    registerFrameSource(() => {
      if (!v.videoWidth) return null;
      if (v.paused) void v.play().catch(() => undefined);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.75);
    });
    return () => {
      registerFrameSource(null);
      v.pause();
      v.srcObject = null;
      v.remove();
    };
  }, [track]);

  // As soon as Orbis is connected and there's an avatar, go live (in the outfit if one
  // is built, else the avatar as is), so there's never a blank space while dressing.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!ready) {
      autoStarted.current = false;
      return;
    }
    // (Orbis sends no state until the first command, so "no state yet" means not started.)
    if (!avatar || snap?.started || switching || autoStarted.current) return;
    autoStarted.current = true;
    void live.current.wear(useCloset.getState().outfit);
  }, [ready, avatar, snap, switching]);

  // Restart the live video from the outfit photo, in the place the double is now.
  const restaged = useRef(new Map<string, string>()); // "photo|place" → photo with that background
  async function reanchor() {
    const outfit = worn.current;
    const top = outfit?.at(-1);
    const base = top?.image ?? useCloset.getState().avatar?.image;
    if (!outfit || !base || !live.current.canWear) return;
    useDirector.setState((d) => ({ reanchoring: true, reanchors: d.reanchors + 1 }));
    try {
      const place = directorPlace();
      let image = base;
      if (place && !/fitting room/i.test(place)) {
        const key = `${top?.chain.join("-") ?? "avatar"}|${place}`;
        image =
          restaged.current.get(key) ??
          (await postJson<{ image: string }>("/api/restage", { image: base, place }).then((r) => r.image).catch(() => base));
        restaged.current.set(key, image);
      }
      await live.current.wear(outfit, { image, place });
    } finally {
      useDirector.setState({ reanchoring: false });
    }
  }

  // Keep in place: every 8 s while the video runs and nothing else is being sent,
  // Gemini checks the frame and walks the double back to its mark if it drifted.
  const keepInPlace = useDirector((d) => d.keepInPlace);
  const running = !!snap?.running && !snap?.paused;
  useEffect(() => {
    if (!running || !keepInPlace) return;
    let checking = false;
    let strikes = 0; // consecutive checks that found the double displaced
    let lastReanchor = 0;
    const id = setInterval(async () => {
      const idle = steerIdle();
      if (checking || idle.busy || idle.since < 8000) return;
      // Gemini refused (project blocked): stop asking every 8 s; the steer buttons still work.
      if (/refusing all Gemini/.test(useDirector.getState().error ?? "")) return;
      checking = true;
      try {
        const r = await checkInPlace();
        if (!r) return;
        strikes = r.displaced ? strikes + 1 : 0;
        if (!r.displaced || steerIdle().busy) return;
        // Orbis rarely pulls back out of a close-up from a prompt alone. Mild drift gets a
        // prompt; if it's severe or still there on the next check, restart the run from the
        // outfit photo (redrawn in the current place) so the framing snaps back.
        if ((r.severe || strikes >= 2) && Date.now() - lastReanchor > 25000) {
          strikes = 0;
          lastReanchor = Date.now();
          await reanchor();
        } else if (r.prompt) {
          useDirector.setState((d) => ({ corrections: d.corrections + 1 }));
          live.current.steer({ label: "Back to centre", raw: r.prompt });
        }
      } finally {
        checking = false;
      }
    }, 8000);
    return () => clearInterval(id);
  }, [running, keepInPlace]);

  // New outfit = new Orbis run: reset → upload the outfit photo → setImage →
  // setPrompt → start. (An image can only be set before `start`.)
  // The outfit on the live video, and where (for re-anchoring).
  const worn = useRef<Layer[] | null>(null);
  // `image`/`place`: restart the run from a photo with another background (re-anchoring).
  // Start (or restart) the live video. `outfit` may be empty: then it's the avatar in
  // their own clothes. `image`/`place`: restart from a photo with another background (re-anchoring).
  async function wear(outfit: Layer[], opts: { image?: string; place?: string } = {}) {
    const top = outfit.at(-1);
    if (!avatar) return;
    setSwitching(true);
    setWearError(null);
    try {
      if (snap?.started) await sendReset(s);
      const blob = await fit16x9(opts.image ?? top?.image ?? avatar.image);
      const ref = await s.uploadFile(blob, { name: `outfit-${top?.chain.join("-") ?? "avatar"}.jpg` });
      // Orbis generates its sound track too (it's part of the run); the page and the
      // headset never play it, so there are still no sound effects.
      await sendSetAudioEnabled(s, true);
      // Highest resolution each device handles well: 4k on a laptop, 2k in the Quest
      // (a 4k frame every frame is too heavy for the headset to draw). The deployment's
      // list can come back empty, so ask anyway and step down if a tier is refused.
      const offered = snap?.available_resolutions ?? [];
      const wanted = isQuestBrowser() ? ["2k", "1080p"] : ["4k", "2k", "1080p"];
      for (const r of wanted) {
        if (offered.length && !offered.includes(r)) continue;
        if (snap?.resolution === r) break;
        // A refused tier may never be acknowledged: give each request 4 s.
        const ok = await Promise.race([
          sendSetResolution(s, r).then((reply) => reply !== undefined, () => false),
          new Promise<boolean>((res) => setTimeout(() => res(false), 4000)),
        ]);
        console.info(`[orbis] resolution ${r}: ${ok ? "accepted" : "refused"}`);
        if (ok) break;
      }
      await sendSetImage(s, ref);
      await sendSetPrompt(s, initialPrompt(avatar.description, outfit.map((l) => l.description), opts.place));
      await sendStart(s);
      setDirectorScene(avatar.description, outfit.map((l) => l.description), opts.place);
      markPromptSent();
      worn.current = outfit;
      setWorn(top?.image ?? null);
    } catch (e) {
      setWearError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-4 py-3 lg:px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-tight text-zinc-100">Fitting Room</h1>
          <span className="hidden border-l border-zinc-800 pl-3 text-[11px] uppercase tracking-wider text-zinc-500 sm:inline">
            Try anything on, then take it anywhere
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/studio" className="text-[11px] uppercase tracking-wider text-zinc-500 hover:text-brand">
            Orbis sandbox
          </a>
          <VRRoom onWear={wear} canWear={ready && !switching} running={!!snap?.running} paused={!!snap?.paused} />
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 lg:h-full lg:flex-row lg:gap-6 lg:overflow-hidden lg:p-6">
        <aside className="flex w-full flex-col gap-4 lg:h-full lg:w-96 lg:shrink-0 lg:overflow-y-auto">
          <AvatarPanel />
          <ClosetPanel />
          <OutfitPanel onWear={wear} canWear={ready && !switching} />
          <LooksPanel />
        </aside>
        <section className="order-first flex min-w-0 flex-1 flex-col gap-4 lg:order-none">
          <StatusBadge />
          <VoiceBar />
          {wearError && <p className="text-xs text-red-400">Couldn&apos;t start the mirror: {wearError}</p>}
          {/* Comparing: the saved look on the left, now (live, or the outfit photo) on the right. */}
          <div className={`flex min-h-0 flex-1 gap-3 ${comparing ? "flex-col sm:flex-row" : ""}`}>
            {comparing && <ComparePane look={comparing} />}
            <div className={`flex min-h-0 flex-1 flex-col gap-2 ${comparing ? "" : "h-full"}`}>
              {comparing && <p className="text-[11px] uppercase tracking-wider text-zinc-500">Now</p>}
              {comparing && !snap?.running && !snap?.paused && nowImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={nowImage} alt="Current outfit" className="min-h-0 w-full flex-1 rounded-md bg-black object-contain" />
              ) : null}
              <div className={comparing && !snap?.running && !snap?.paused && nowImage ? "hidden" : "min-h-0 flex-1"}>
                <Video audio={false} />
              </div>
            </div>
          </div>
          <SteerPanel running={!!snap?.running} paused={!!snap?.paused} />
        </section>
      </main>
    </div>
  );
}

/** The Quest Browser (or another headset browser): prefer a lighter video resolution. */
function isQuestBrowser() {
  return typeof navigator !== "undefined" && /OculusBrowser|Quest|Pico/i.test(navigator.userAgent);
}
