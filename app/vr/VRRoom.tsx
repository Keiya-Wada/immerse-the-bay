"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { XR, createXRStore, useXR } from "@react-three/xr";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import {
  CATEGORIES,
  clearOutfit,
  compareWith,
  currentLookSaved,
  deleteItem,
  deleteLook,
  itemImageUrl,
  lookImageUrl,
  lookTitle,
  makeStatue,
  photoSeconds,
  putOn,
  redoLast,
  saveLook,
  setQuality,
  takeOff,
  useCloset,
  wearLook,
  type Layer,
  type Slot,
} from "../lib/closet";
import { PLACE_STEERS, POSE_STEERS } from "../lib/closetPrompts";
import { setInXR, useSteer, useSteerState } from "../lib/steer";
import { useVoice, voiceStart, voiceStop } from "../lib/voice";
import { useDirector } from "../lib/director";
import { Statue } from "./Statue";
import { sendPause, sendResume, useVideoTrack, useViskoOrbisStable } from "../lib/visko";

// The VR fitting room (Quest Browser, WebXR). Same closet store, same Orbis
// session and same `wear` as the 2D page; only the presentation changes.
//
// Layout, in meters, from where you stand (looking down -Z):
//   your double (live Orbis video) life-size on the floor ~3 m ahead, a steering desk
//   at waist height just in front, outfit stand and closet rail 1.6 m away, 50° to
//   the left and right (close enough to read on a Quest 2, clear of the double),
//   the saved-looks shelf straight to your left, and the 3D statue behind you.
//
// Two modes: VR (a dim room) and passthrough (immersive-ar on Quest 3: the double
// stands in your real room, the video's edges fade so it reads as a doorway).
//
// On localhost without a headset, @react-three/xr injects a Quest emulator,
// so "Enter VR" works in a desktop browser for testing.

const xrStore = createXRStore({
  hand: false,
  // Localhost emulator: a Quest with controllers, without the passthrough-room add-on
  // (it bundles an older three.js and breaks rendering).
  emulate: { type: "metaQuest3", syntheticEnvironment: false, primaryInputMode: "controller" },
});
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __xrStore: typeof xrStore }).__xrStore = xrStore; // for headless tests
}

type Props = {
  onWear: (outfit: Layer[]) => void;
  canWear: boolean;
  running: boolean;
  paused: boolean;
};

/** "Enter VR" button for the page header + the (hidden) canvas that renders the room. */
export default function VRRoom(props: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [arSupported, setArSupported] = useState(false);
  useEffect(() => {
    const check = () => {
      const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
      if (!xr) return setSupported(false);
      xr.isSessionSupported("immersive-vr").then(setSupported, () => setSupported(false));
      xr.isSessionSupported("immersive-ar").then(setArSupported, () => setArSupported(false));
    };
    check();
    // On localhost the emulator loads asynchronously; check again once it's installed.
    return xrStore.subscribe((st, prev) => {
      if (st.emulator && !prev.emulator) check();
    });
  }, []);

  return (
    <>
      <button
        onClick={() => xrStore.enterVR()}
        disabled={!supported}
        title={supported === false ? "Open this page in the Quest Browser (over HTTPS) to enter VR" : undefined}
        className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
      >
        {supported === false ? "VR not available here" : "Enter VR"}
      </button>
      {arSupported && (
        <button
          onClick={() => xrStore.enterAR()}
          title="Mixed reality: your double appears in your real room (Quest 3)"
          className="rounded-md border border-brand px-3 py-1 text-xs font-medium text-brand hover:bg-brand/10"
        >
          Passthrough
        </button>
      )}
      {/* The canvas only draws while a session is running; outside VR the scene is empty. */}
      <div className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0" aria-hidden>
        <Canvas gl={{ antialias: true }}>
          <XR store={xrStore}>
            <Room {...props} />
          </XR>
        </Canvas>
      </div>
    </>
  );
}

// ── Building blocks ──────────────────────────────────────────────────────────

const noRaycast = () => undefined;
const C = {
  panel: "#1c1917",
  button: "#3f3a36",
  hover: "#57514b",
  brand: "#f59e0b",
  brandFg: "#1c1917",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  error: "#f87171",
  ok: "#4ade80",
  pressed: "#fcd34d",
};

/** A short controller vibration, so a press is felt even before anything changes. */
function buzz(intensity: number, ms: number) {
  for (const src of xrStore.getState().session?.inputSources ?? []) {
    const pads = (src.gamepad as (Gamepad & { hapticActuators?: { pulse?: (i: number, d: number) => unknown }[] }) | undefined)
      ?.hapticActuators;
    try {
      void pads?.[0]?.pulse?.(intensity, ms);
    } catch {
      /* no haptics */
    }
  }
}

function Label({
  children,
  size = 0.035,
  color = C.text,
  anchorX = "center",
  maxWidth,
  position,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  anchorX?: "left" | "center" | "right";
  maxWidth?: number;
  position?: [number, number, number];
}) {
  return (
    <Text
      position={position}
      fontSize={size}
      color={color}
      anchorX={anchorX}
      anchorY="middle"
      maxWidth={maxWidth}
      raycast={noRaycast}
    >
      {children}
    </Text>
  );
}

function Button({
  label,
  onClick,
  position,
  width = 0.22,
  height = 0.07,
  disabled,
  primary,
  active,
  onPress,
  onRelease,
}: {
  label: string;
  onClick: () => void;
  onPress?: () => void; // trigger pulled on the button (for hold-to-talk)
  onRelease?: () => void; // trigger released, or the ray left the button while held
  position?: [number, number, number];
  width?: number;
  height?: number;
  disabled?: boolean;
  primary?: boolean;
  active?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [down, setDown] = useState(false);
  const pressed = useRef(false);
  const bg = down && !disabled ? C.pressed : primary || active ? C.brand : hover && !disabled ? C.hover : C.button;
  // Fire on trigger release over the same button. (The built-in onClick drops any
  // press longer than 300 ms, and people pull a controller trigger slowly.)
  return (
    <group position={position}>
      <mesh
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          pressed.current = true;
          setDown(true);
          buzz(disabled ? 0.15 : 0.5, disabled ? 15 : 30);
          if (!disabled) onPress?.();
        }}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          if (pressed.current && !disabled) onClick();
          if (pressed.current) onRelease?.();
          pressed.current = false;
          setDown(false);
        }}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => {
          setHover(false);
          setDown(false);
          if (pressed.current) onRelease?.();
          pressed.current = false;
        }}
      >
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={bg} transparent opacity={disabled ? 0.35 : 1} />
      </mesh>
      <Label size={height * 0.42} color={primary || active ? C.brandFg : C.text} maxWidth={width * 0.92} position={[0, 0, 0.002]}>
        {label}
      </Label>
    </group>
  );
}

function Panel({ width, height, position, rotation, children }: {
  width: number;
  height: number;
  position: [number, number, number];
  rotation?: [number, number, number];
  children: ReactNode;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={C.panel} transparent opacity={0.92} />
      </mesh>
      {children}
    </group>
  );
}

/** A data:/http image as a texture, disposed when the URL changes. */
function useImageTexture(url?: string): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) return setTex(null);
    let dead = false;
    let loaded: THREE.Texture | undefined;
    new THREE.TextureLoader().load(url, (t) => {
      if (dead) return t.dispose();
      t.colorSpace = THREE.SRGBColorSpace;
      loaded = t;
      setTex(t);
    });
    return () => {
      dead = true;
      loaded?.dispose();
    };
  }, [url]);
  return tex;
}

/** Image fitted inside a w×h box without cropping. */
function Picture({ url, width, height, position, dim }: {
  url?: string;
  width: number;
  height: number;
  position?: [number, number, number];
  dim?: boolean;
}) {
  const tex = useImageTexture(url);
  const img = tex?.image as { width: number; height: number } | undefined;
  let w = width;
  let h = height;
  if (img?.width && img?.height) {
    const k = Math.min(width / img.width, height / img.height);
    w = img.width * k;
    h = img.height * k;
  }
  return (
    <group position={position}>
      <mesh raycast={noRaycast}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#0c0a09" />
      </mesh>
      {tex && (
        <mesh position={[0, 0, 0.001]} raycast={noRaycast}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={tex} color={dim ? "#777" : "#fff"} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * The Orbis video track as a texture (a muted <video> of its own; the 2D page keeps its view).
 * Refreshed from the XR frame loop: THREE.VideoTexture relies on the page's
 * requestVideoFrameCallback, which stops firing while an immersive session runs.
 */
/** Frame stats for the status readout (written by useStreamTexture every frame). */
const stream = { frames: 0, lastFrameAt: 0, restarts: 0, width: 0, height: 0, paused: false, trackState: "none", orbisPaused: false };

function useStreamTexture(track?: MediaStreamTrack): THREE.Texture | null {
  const [state, setState] = useState<{ tex: THREE.Texture; video: HTMLVideoElement } | null>(null);
  const [hasFrames, setHasFrames] = useState(false); // false while Orbis primes: keep showing the placeholder
  const [restart, setRestart] = useState(0); // bumped to rebuild the <video> if it stalls
  useEffect(() => {
    setHasFrames(false);
    if (!track) return setState(null);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    // Keep it in the document (tiny, nearly invisible): some browsers stop decoding
    // detached or hidden video elements, which froze the picture in the headset.
    Object.assign(video.style, { position: "fixed", left: "0", top: "0", width: "2px", height: "2px", opacity: "0.01", pointerEvents: "none" });
    document.body.appendChild(video);
    // No `autoplay`: Chrome pauses muted autoplay videos that are off screen, and this
    // one is never on screen. Playback is started (and kept going) explicitly instead.
    video.srcObject = new MediaStream([track]);
    video.play().catch(() => undefined);
    const tex = new THREE.Texture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    setState({ tex, video });
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __mirror: { video, tex } }); // for headless tests
    stream.lastFrameAt = performance.now();
    return () => {
      tex.dispose();
      video.pause();
      video.srcObject = null;
      video.remove();
    };
  }, [track, restart]);
  const lastTime = useRef(-1);
  useFrame(() => {
    stream.trackState = track?.readyState ?? "none";
    if (!state) return;
    const { tex, video } = state;
    stream.paused = video.paused;
    if (video.paused) video.play().catch(() => undefined);
    // Frames were arriving, the track is still live, but nothing new for 5 s: rebuild the video element.
    if (stream.orbisPaused) stream.lastFrameAt = performance.now(); // paused on purpose: no frames expected
    if (hasFrames && track?.readyState === "live" && performance.now() - stream.lastFrameAt > 5000) {
      stream.restarts++;
      stream.lastFrameAt = performance.now();
      setRestart((n) => n + 1);
      return;
    }
    // Upload only when the video has a new frame: Orbis delivers far fewer frames than
    // the headset's 72 Hz, and each upload is a full-size frame.
    if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.currentTime !== lastTime.current) {
      lastTime.current = video.currentTime;
      // three.js sizes the GPU texture from the element's width/height attributes, which
      // are 0 on a <video> made in code. Match them to the stream (and re-allocate if a
      // new run arrives at a different resolution).
      if (video.width !== video.videoWidth || video.height !== video.videoHeight) {
        video.width = video.videoWidth;
        video.height = video.videoHeight;
        tex.dispose();
      }
      tex.needsUpdate = true;
      stream.frames++;
      stream.lastFrameAt = performance.now();
      stream.width = video.videoWidth;
      stream.height = video.videoHeight;
      if (!hasFrames) setHasFrames(true);
    }
  });
  return state && hasFrames ? state.tex : null;
}

// ── The room ─────────────────────────────────────────────────────────────────

function Room(props: Props) {
  const session = useXR((s) => s.session);
  const mode = useXR((s) => s.mode);
  const gl = useThree((st) => st.gl);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __gl: gl }); // for headless tests
  }, [gl]);
  const s = useViskoOrbisStable();
  // Where the double stands (meters ahead) and a size trim, adjustable from the desk
  // (in passthrough a real wall may be closer than 3 m).
  const [distance, setDistance] = useState(3.0);
  const [scale, setScale] = useState(1);

  // The video keeps running when the headset is taken off (no auto-pause); Pause on the desk stops it.
  useEffect(() => {
    setInXR(!!session);
    return () => setInXR(false);
  }, [session]);

  stream.orbisPaused = props.paused;
  if (!session) return null;
  const ar = mode === "immersive-ar";
  return (
    <>
      {!ar && <color attach="background" args={["#14110f"]} />}
      <hemisphereLight args={["#fff7ed", "#292524", 1.2]} />
      {!ar && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <circleGeometry args={[5, 48]} />
          <meshStandardMaterial color="#d6c7b2" />
        </mesh>
      )}
      <Double distance={distance} scale={scale} paused={props.paused} />
      <PushToTalk />
      <SteerDesk
        running={props.running}
        paused={props.paused}
        distance={distance}
        setDistance={setDistance}
        scale={scale}
        setScale={setScale}
      />
      <OutfitStand onWear={props.onWear} canWear={props.canWear} />
      <ClosetRail />
      <LooksShelf />
      <StatueCorner />
    </>
  );
}

// Orbis frames a full-body shot with the person about 3/4 of the frame height, so a
// 2.25 m tall frame standing on the floor shows them at roughly real height.
const DOUBLE_H = 2.25;
const DOUBLE_W = (DOUBLE_H * 16) / 9;

/** Alpha mask that fades the video's sides and top (not the floor edge), so it reads as an opening, not a TV. */
function useFeatherMask() {
  const [tex] = useState(() => {
    const W = 128;
    const H = 72;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W, H);
    const ease = (t: number) => Math.min(1, Math.max(0, t)) ** 1.5;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1);
        const v = y / (H - 1); // 0 = top
        const a = ease(Math.min(u, 1 - u) / 0.07) * ease(v / 0.08) * ease((1 - v) / 0.015);
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  });
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

const COMPARE_CROP = 0.4; // the middle 40% of a full-body 16:9 frame holds the person

/** A photo at life size (same framing as the video), cropped to the person, edges faded. */
function LifeImage({ url, height, position }: { url: string; height: number; position: [number, number, number] }) {
  const tex = useImageTexture(url);
  const mask = useFeatherMask();
  const img = tex?.image as { width: number; height: number } | undefined;
  const aspect = img?.width && img?.height ? img.width / img.height : 16 / 9;
  useEffect(() => {
    if (!tex) return;
    tex.repeat.set(COMPARE_CROP, 1);
    tex.offset.set((1 - COMPARE_CROP) / 2, 0);
  }, [tex]);
  if (!tex) return null;
  return (
    <mesh position={position} raycast={noRaycast}>
      <planeGeometry args={[height * aspect * COMPARE_CROP, height]} />
      <meshBasicMaterial map={tex} alphaMap={mask} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Your double: the live Orbis video at life size, standing on the floor in front of you. */
function Double({ distance, scale, paused }: { distance: number; scale: number; paused: boolean }) {
  const s = useViskoOrbisStable();
  const track = useVideoTrack();
  const video = useStreamTexture(track);
  const mask = useFeatherMask();
  const top = useCloset((st) => st.outfit.at(-1));
  const avatar = useCloset((st) => st.avatar);
  const compare = useCloset((st) => st.looks.find((l) => l.id === st.compareId));
  const status = s.status;
  const h = DOUBLE_H * scale;
  const w = DOUBLE_W * scale;
  // Comparing: crop both to the person and stand them side by side, saved look on the left.
  const crop = compare ? COMPARE_CROP : 1;
  useEffect(() => {
    if (!video) return;
    video.repeat.set(crop, 1);
    video.offset.set((1 - crop) / 2, 0);
  }, [video, crop]);

  if (compare) {
    const x = (w * COMPARE_CROP) / 2 + 0.05;
    return (
      <group position={[0, h / 2, -distance]}>
        <LifeImage url={lookImageUrl(compare)} height={h} position={[-x, 0, 0]} />
        {video ? (
          <mesh position={[x, 0, 0]} raycast={noRaycast}>
            <planeGeometry args={[w * COMPARE_CROP, h]} />
            <meshBasicMaterial map={video} alphaMap={mask} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        ) : (
          top && <LifeImage url={top.image} height={h} position={[x, 0, 0]} />
        )}
        <Label size={0.06} color={C.muted} maxWidth={w * COMPARE_CROP} position={[-x, h / 2 + 0.12, 0]}>
          {`Saved · ${lookTitle(compare)}`.slice(0, 60)}
        </Label>
        <Label size={0.06} color={C.brand} position={[x, h / 2 + 0.12, 0]}>
          {video ? "Now (live)" : "Now"}
        </Label>
      </group>
    );
  }

  return (
    <group position={[0, h / 2, -distance]}>
      {video ? (
        <mesh raycast={noRaycast}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={video} alphaMap={mask} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ) : (
        <>
          <Picture url={top?.image ?? avatar?.image} width={w} height={h} dim />
          <group position={[0, 0.2, 0.01]}>
            <Label size={0.08} maxWidth={w * 0.8}>
              {paused
                ? "Paused · press Resume on the desk"
                : !avatar
                  ? "Create an avatar on the page first"
                  : !top
                    ? "Pick clothes from the rail on your right"
                    : status !== "ready"
                      ? "Connect to see your double live"
                      : "Press Wear it live on your left"}
            </Label>
            {avatar && top && status === "disconnected" && (
              <Button label="Connect" width={0.5} height={0.12} primary position={[0, -0.2, 0]} onClick={() => s.connect()} />
            )}
            {status === "connecting" && (
              <Label size={0.05} color={C.brand} position={[0, -0.2, 0]}>
                Connecting…
              </Label>
            )}
          </group>
        </>
      )}
    </group>
  );
}

const ago = (t: number) => {
  const sec = Math.round((Date.now() - t) / 1000);
  return sec < 60 ? `${sec}s ago` : `${Math.round(sec / 60)}m ago`;
};

/** Two status lines: is the video live, and what happened to the last steer. Refreshed twice a second. */
function StatusLines({ position }: { position: [number, number, number] }) {
  const status = useViskoOrbisStable().status;
  const { sending, queued, last, error } = useSteerState();
  const director = useDirector();
  const [, tick] = useState(0);
  const prev = useRef({ frames: 0, at: 0, fps: 0 });
  useFrame(() => {
    const now = performance.now();
    if (now - prev.current.at < 500) return;
    prev.current = { frames: stream.frames, at: now, fps: ((stream.frames - prev.current.frames) * 1000) / (now - prev.current.at || 1) };
    tick((n) => n + 1);
  });
  const fps = Math.round(prev.current.fps);
  const stale = performance.now() - stream.lastFrameAt;
  const video =
    status !== "ready"
      ? { text: `Video: ${status}`, color: C.muted }
      : stream.orbisPaused
        ? { text: "Video: paused (saving credits)", color: C.muted }
        : stream.trackState !== "live"
          ? { text: "Video: no stream yet (press Wear it live)", color: C.muted }
          : stale > 2000
            ? { text: `Video: frozen ${Math.round(stale / 1000)}s${stream.paused ? " (player paused)" : ""} · restarts ${stream.restarts}`, color: C.error }
            : { text: `Video: live · ${fps} fps · ${stream.width}×${stream.height}${stream.restarts ? ` · restarts ${stream.restarts}` : ""}`, color: C.ok };
  const steerLine = error
    ? { text: `Steer failed: ${error}`.slice(0, 90), color: C.error }
    : sending
      ? { text: `Sending: ${sending}…${queued && queued !== sending ? ` then ${queued}` : ""}`, color: C.brand }
      : last
        ? { text: `${last.label} accepted ${ago(last.at)} · takes 2–4 s to show`, color: C.ok }
        : { text: "No steer sent yet", color: C.muted };
  const keep = !director.keepInPlace
    ? { text: "Keep in place: off", color: C.muted }
    : director.reanchoring
      ? { text: "Keep in place: restarting the video to re-centre…", color: C.brand }
      : director.error
      ? { text: `Keep in place: ${director.error}`.slice(0, 90), color: C.error }
      : director.lastCheck
        ? {
            text: `Keep in place: ${director.lastCheck.displaced ? "moving back to centre" : "on its mark"} (${ago(director.lastCheck.at)}) · ${director.corrections} nudges, ${director.reanchors} restarts`,
            color: director.lastCheck.displaced ? C.brand : C.ok,
          }
        : { text: "Keep in place: watching", color: C.muted };
  return (
    <group position={position}>
      <Label size={0.022} color={video.color} position={[0, 0.03, 0]}>
        {video.text}
      </Label>
      <Label size={0.022} color={steerLine.color} position={[0, 0, 0]}>
        {steerLine.text}
      </Label>
      <Label size={0.022} color={keep.color} position={[0, -0.03, 0]}>
        {keep.text}
      </Label>
    </group>
  );
}

const SIZES = [1, 1.08, 0.92];

function SteerDesk({
  running,
  paused,
  distance,
  setDistance,
  scale,
  setScale,
}: {
  running: boolean;
  paused: boolean;
  distance: number;
  setDistance: (d: number) => void;
  scale: number;
  setScale: (s: number) => void;
}) {
  const s = useViskoOrbisStable();
  const { steer, sending, queued } = useSteer();
  const W = 0.2;
  const gap = 0.215;
  const row = (list: typeof POSE_STEERS, y: number) =>
    list.map((st, i) => (
      <Button
        key={st.label}
        label={st.label}
        width={W}
        position={[(i - (list.length - 1) / 2) * gap, y, 0]}
        disabled={!running}
        active={sending === st.label || queued === st.label}
        onClick={() => steer(st)}
      />
    ));

  return (
    <Panel width={1.2} height={0.64} position={[0, 0.85, -0.75]} rotation={[-0.75, 0, 0]}>
      <Label size={0.028} color={C.muted} position={[0, 0.29, 0]}>
        {running ? "Steer your double" : paused ? "Paused" : "Wear an outfit to start steering"}
      </Label>
      <StatusLines position={[0, 0.215, 0]} />
      {row(POSE_STEERS, 0.135)}
      {row(PLACE_STEERS, 0.05)}
      {[
        {
          label: paused ? "Resume" : "Pause",
          disabled: !running && !paused,
          onClick: () => (paused ? sendResume(s) : sendPause(s)).catch(() => undefined),
        },
        { label: "Closer", disabled: distance <= 1.6, onClick: () => setDistance(Math.max(1.6, distance - 0.4)) },
        { label: "Farther", disabled: distance >= 4.2, onClick: () => setDistance(Math.min(4.2, distance + 0.4)) },
        {
          label: `Size ${Math.round(scale * 100)}%`,
          onClick: () => setScale(SIZES[(SIZES.indexOf(scale) + 1) % SIZES.length]),
        },
        { label: "Exit", onClick: () => xrStore.getState().session?.end() },
      ].map((b, i) => (
        <Button key={i} label={b.label} width={W} position={[(i - 2) * gap, -0.07, 0]} disabled={b.disabled} onClick={b.onClick} />
      ))}
      <VoiceRow y={-0.2} />
    </Panel>
  );
}

function OutfitStand({ onWear, canWear }: { onWear: (o: Layer[]) => void; canWear: boolean }) {
  const { items, outfit, busy, outfitError, wornImage, looks, quality } = useCloset();
  const saved = currentLookSaved({ outfit, looks });
  const top = outfit.at(-1);
  const title = (id: string) => items.find((i) => i.id === id)?.title ?? "Item";
  const listTop = -0.08;

  return (
    <Panel width={1.0} height={1.15} position={[-1.25, 1.35, -1.05]} rotation={[0, 0.87, 0]}>
      <Label size={0.045} anchorX="left" position={[-0.45, 0.51, 0]}>
        Outfit
      </Label>
      <Button
        label={quality === "best" ? "Photos: Best quality" : "Photos: Fast"}
        active={quality === "best"}
        width={0.32}
        height={0.055}
        position={[0.3, 0.51, 0]}
        onClick={() => setQuality(quality === "best" ? "fast" : "best")}
      />
      <Picture url={top?.image} width={0.9} height={0.506} position={[0, 0.2, 0]} />
      {!top && (
        <Label size={0.03} color={C.muted} maxWidth={0.8} position={[0, 0.2, 0.01]}>
          Nothing on yet. Pick something from the rail.
        </Label>
      )}
      {outfit.slice(-5).map((l, i) => (
        <group key={l.itemId} position={[0, listTop - i * 0.065, 0]}>
          <Label size={0.024} color={C.muted} anchorX="left" position={[-0.45, 0, 0]}>
            {l.slot.toUpperCase()}
          </Label>
          <Label size={0.028} anchorX="left" maxWidth={0.5} position={[-0.3, 0, 0]}>
            {title(l.itemId).slice(0, 34)}
          </Label>
          <Button label="Take off" width={0.15} height={0.05} position={[0.36, 0, 0]} disabled={!!busy} onClick={() => takeOff(l.itemId)} />
        </group>
      ))}
      <Label size={0.026} color={outfitError ? C.error : C.brand} maxWidth={0.9} position={[0, -0.42, 0]}>
        {outfitError ? outfitError.slice(0, 120) : busy ? `${busy} (~${photoSeconds(quality)} s each)` : ""}
      </Label>
      {top && (
        <>
          <Button
            label={top.image === wornImage ? "Restart live" : "Wear it live"}
            primary
            width={0.3}
            position={[-0.32, -0.51, 0]}
            disabled={!canWear || !!busy}
            onClick={() => onWear(outfit)}
          />
          <Button
            label={saved ? "Saved ✓" : "Save look"}
            width={0.2}
            position={[-0.055, -0.51, 0]}
            disabled={!!busy || saved}
            onClick={saveLook}
          />
          <Button label="Redo last" width={0.18} position={[0.155, -0.51, 0]} disabled={!!busy} onClick={redoLast} />
          <Button label="Start over" width={0.18} position={[0.355, -0.51, 0]} disabled={!!busy} onClick={clearOutfit} />
        </>
      )}
    </Panel>
  );
}

const COLS = 3;
const PER_PAGE = 9;

function ClosetRail() {
  const { avatar, items, outfit, busy } = useCloset();
  const [tab, setTab] = useState<Slot | "all">("all");
  const [page, setPage] = useState(0);
  const tabs = [{ slot: "all" as const, label: "All" }, ...CATEGORIES.filter((c) => items.some((i) => i.slot === c.slot))];
  const inTab = tab === "all" ? items : items.filter((i) => i.slot === tab);
  const pages = Math.max(1, Math.ceil(inTab.length / PER_PAGE));
  const p = Math.min(page, pages - 1);
  const shown = inTab.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
  const wearing = new Set(outfit.map((l) => l.itemId));
  const tabW = Math.min(0.15, 1.04 / tabs.length);
  const [confirmId, setConfirmId] = useState<string | null>(null); // remove takes two presses
  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmId]);

  return (
    <Panel width={1.1} height={1.6} position={[1.25, 1.35, -1.05]} rotation={[0, -0.87, 0]}>
      <Label size={0.045} position={[0, 0.72, 0]}>
        Closet
      </Label>
      {tabs.map((t, i) => (
        <Button
          key={t.slot}
          label={t.label}
          width={tabW - 0.006}
          height={0.055}
          active={tab === t.slot}
          position={[(i - (tabs.length - 1) / 2) * tabW, 0.62, 0]}
          onClick={() => {
            setTab(t.slot);
            setPage(0);
          }}
        />
      ))}
      <mesh position={[0, 0.535, 0.01]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast}>
        <cylinderGeometry args={[0.008, 0.008, 1.0, 12]} />
        <meshStandardMaterial color="#a8a29e" metalness={0.6} roughness={0.3} />
      </mesh>
      {items.length === 0 && (
        <Label size={0.03} color={C.muted} maxWidth={0.9} position={[0, 0.2, 0]}>
          Your closet is empty. Add clothes on the page (photos, a link or a description), then come back.
        </Label>
      )}
      {shown.map((item, i) => {
        const on = wearing.has(item.id);
        const x = ((i % COLS) - (COLS - 1) / 2) * 0.34;
        const y = 0.33 - Math.floor(i / COLS) * 0.4;
        return (
          <group key={item.id} position={[x, y, 0]}>
            <mesh position={[0, -0.02, -0.002]} raycast={noRaycast}>
              <planeGeometry args={[0.32, 0.38]} />
              <meshBasicMaterial color={on ? C.brand : "#292524"} />
            </mesh>
            {item.image ? (
              <Picture url={itemImageUrl(item)} width={0.3} height={0.22} position={[0, 0.05, 0]} />
            ) : (
              <Label size={0.026} maxWidth={0.28} position={[0, 0.05, 0]}>
                {item.text?.slice(0, 80) ?? item.title}
              </Label>
            )}
            <Label size={0.026} color={on ? C.brandFg : C.text} maxWidth={0.3} position={[0, -0.095, 0]}>
              {item.title.slice(0, 24)}
            </Label>
            {confirmId === item.id ? (
              <Button
                label="Remove from closet?"
                width={0.28}
                height={0.055}
                position={[0, -0.165, 0.001]}
                active
                onClick={() => {
                  setConfirmId(null);
                  void deleteItem(item.id);
                }}
              />
            ) : (
              <>
                <Button
                  label={on ? "Take off" : outfit.length ? "Add to outfit" : "Try on"}
                  width={0.205}
                  height={0.055}
                  position={[-0.0375, -0.165, 0.001]}
                  disabled={!!busy || (!on && !avatar)}
                  onClick={() => (on ? takeOff(item.id) : putOn(item.id))}
                />
                <Button
                  label="✕"
                  width={0.065}
                  height={0.055}
                  position={[0.1075, -0.165, 0.001]}
                  disabled={on && !!busy}
                  onClick={() => setConfirmId(item.id)}
                />
              </>
            )}
          </group>
        );
      })}
      {pages > 1 && (
        <>
          <Button label="‹ Prev" width={0.18} position={[-0.3, -0.75, 0]} disabled={p === 0} onClick={() => setPage(p - 1)} />
          <Label size={0.026} color={C.muted} position={[0, -0.75, 0]}>
            {`${p + 1} / ${pages}`}
          </Label>
          <Button label="Next ›" width={0.18} position={[0.3, -0.75, 0]} disabled={p >= pages - 1} onClick={() => setPage(p + 1)} />
        </>
      )}
    </Panel>
  );
}

const LOOKS_PER_PAGE = 4;

/** Saved looks, on your left: save the current outfit, and compare one with it at life size. */
function LooksShelf() {
  const { looks, compareId, outfit, busy } = useCloset();
  const saved = currentLookSaved({ outfit, looks });
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(looks.length / LOOKS_PER_PAGE));
  const p = Math.min(page, pages - 1);
  const shown = looks.slice(p * LOOKS_PER_PAGE, (p + 1) * LOOKS_PER_PAGE);
  const comparing = looks.find((l) => l.id === compareId);

  return (
    <Panel width={1.0} height={1.15} position={[-1.6, 1.35, 0.05]} rotation={[0, Math.PI / 2, 0]}>
      <Label size={0.045} position={[0, 0.51, 0]}>
        Saved looks
      </Label>
      {pages > 1 && (
        <>
          <Button label="‹" width={0.08} position={[-0.42, 0.51, 0]} disabled={p === 0} onClick={() => setPage(p - 1)} />
          <Button label="›" width={0.08} position={[0.42, 0.51, 0]} disabled={p >= pages - 1} onClick={() => setPage(p + 1)} />
        </>
      )}
      <Button
        label={saved ? "This look is saved ✓" : "Save the look I have on"}
        primary={!saved && outfit.length > 0}
        width={0.5}
        height={0.065}
        position={[0, 0.42, 0]}
        disabled={!outfit.length || saved || !!busy}
        onClick={saveLook}
      />
      {looks.length === 0 && (
        <Label size={0.03} color={C.muted} maxWidth={0.8} position={[0, 0.1, 0]}>
          No saved looks yet. Save an outfit, try other things on, then compare them here side by side.
        </Label>
      )}
      {shown.map((look, i) => {
        const x = ((i % 2) - 0.5) * 0.47;
        const y = 0.22 - Math.floor(i / 2) * 0.36;
        const on = look.id === compareId;
        return (
          <group key={look.id} position={[x, y, 0]}>
            <mesh position={[0, -0.055, -0.002]} raycast={noRaycast}>
              <planeGeometry args={[0.45, 0.35]} />
              <meshBasicMaterial color={on ? C.brand : "#292524"} />
            </mesh>
            <Picture url={lookImageUrl(look)} width={0.42} height={0.2} position={[0, 0.0, 0]} />
            <Label size={0.022} color={on ? C.brandFg : C.text} maxWidth={0.42} position={[0, -0.135, 0]}>
              {lookTitle(look).slice(0, 44)}
            </Label>
            <Button
              label={on ? "Comparing" : "Compare"}
              width={0.42}
              height={0.05}
              active={on}
              position={[0, -0.195, 0.001]}
              onClick={() => compareWith(on ? null : look.id)}
            />
          </group>
        );
      })}
      {comparing && (
        <>
          <Button
            label="Put it back on"
            primary
            width={0.3}
            position={[-0.3, -0.51, 0]}
            disabled={!!busy}
            onClick={() => wearLook(comparing.id)}
          />
          <Button label="Stop comparing" width={0.3} position={[0.02, -0.51, 0]} onClick={() => compareWith(null)} />
          <Button label="Delete" width={0.2} position={[0.33, -0.51, 0]} onClick={() => deleteLook(comparing.id)} />
        </>
      )}
    </Panel>
  );
}

/** Hold-to-talk on the desk, plus what was heard and done. */
function VoiceRow({ y }: { y: number }) {
  const { phase, transcript, result, error } = useVoice();
  const line = error
    ? { text: error, color: C.error }
    : phase === "listening"
      ? { text: "Listening… let go to send", color: C.error }
      : phase === "thinking"
        ? { text: transcript ? `“${transcript}”` : "Thinking…", color: C.brand }
        : result
          ? { text: `${transcript ? `“${transcript}” → ` : ""}${result}`, color: C.text }
          : { text: "Hold A or X and speak: “try the red sweater with jeans”, “turn around”, “beach”", color: C.muted };
  return (
    <group position={[0, y, 0]}>
      <Button
        label={phase === "listening" ? "● Listening" : "Hold to talk"}
        active={phase === "listening"}
        width={0.26}
        height={0.08}
        position={[-0.44, 0, 0]}
        disabled={phase === "thinking"}
        onClick={() => undefined}
        onPress={() => void voiceStart()}
        onRelease={() => void voiceStop()}
      />
      <Label size={0.024} color={line.color} anchorX="left" maxWidth={0.82} position={[-0.29, 0, 0]}>
        {line.text.slice(0, 220)}
      </Label>
    </group>
  );
}

/** Push-to-talk on the controllers: hold A (right) or X (left) while speaking. */
function PushToTalk() {
  const session = useXR((s) => s.session);
  const held = useRef(false);
  useFrame(() => {
    let down = false;
    for (const src of session?.inputSources ?? []) {
      if (src.gamepad?.buttons[4]?.pressed) down = true; // xr-standard: 4 = A / X
    }
    if (down && !held.current) {
      held.current = true;
      buzz(0.6, 40);
      void voiceStart();
    } else if (!down && held.current) {
      held.current = false;
      buzz(0.3, 20);
      void voiceStop();
    }
  });
  return null;
}

const STATUE_AT: [number, number, number] = [0, 0, 1.7];

/** Behind you: the statue of your current outfit, and a small panel to make it. */
function StatueCorner() {
  const { statue, statueBusy, statueError, outfit } = useCloset();
  const top = outfit.at(-1);
  const stale = !!statue && !!top && statue.from !== top.image;
  const panelAt: [number, number, number] = [0.95, 1.25, 1.35];
  const unusable = useCallback(
    () => useCloset.setState({ statue: null, statueError: "Gemini's drawing didn't show four separate views. Press Make statue to try again." }),
    [],
  );
  return (
    <>
      {statue && (
        <Statue
          sheet={statue.sheet}
          position={STATUE_AT}
          facing={Math.PI}
          onUnusable={unusable}
        />
      )}
      <Panel width={0.7} height={0.42} position={panelAt} rotation={[0, Math.atan2(-panelAt[0], -panelAt[2]), 0]}>
        <Label size={0.04} position={[0, 0.16, 0]}>
          3D statue
        </Label>
        <Label size={0.024} color={statueError ? C.error : statueBusy ? C.brand : C.muted} maxWidth={0.62} position={[0, 0.07, 0]}>
          {statueError
            ? statueError.slice(0, 110)
            : statueBusy
              ? "Drawing every side of your outfit… ~20 s"
              : !top
                ? "Put an outfit on first."
                : statue
                  ? stale
                    ? "This statue shows an older outfit."
                    : "Walk around it, or spin it with the left thumbstick."
                  : "Make a life-size statue of your outfit to walk around."}
        </Label>
        <Button
          label={statue ? (stale ? "Make it of this outfit" : "Make it again") : "Make statue"}
          primary={!statue || stale}
          width={0.42}
          height={0.08}
          position={[0, -0.08, 0]}
          disabled={!top || statueBusy}
          onClick={makeStatue}
        />
      </Panel>
    </>
  );
}
