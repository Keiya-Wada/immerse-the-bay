"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";

// The "3D statue": not a mesh, but a turnaround sheet (front, both sides, back,
// drawn by Gemini on a green background) shown as a life-size cut-out that turns
// to face you and switches to the side you're looking at, cross-fading between
// neighbouring views. Walk around it, or spin it with the left thumbstick.
//
// Gemini doesn't reliably put the two side views in the order asked, so each
// side view's facing direction is measured from the picture (toes and nose
// stick out the way the person faces).

// One view on the sheet: uv rect, size in meters, and how far below the plane's bottom edge the feet are.
type Rect = { u0: number; v0: number; u1: number; v1: number; w: number; h: number; feet: number };
type Views = { angles: number[]; rects: Rect[] };

const HEIGHT_M = 1.75; // the figure's height in the room

/** Find the four figures on the green sheet and work out which side each one shows. */
function analyzeSheet(img: HTMLImageElement | ImageBitmap): Views | null {
  const W = 480;
  const H = Math.round((img.height / img.width) * W);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;
  const fg = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 4], gr = px[i * 4 + 1], b = px[i * 4 + 2];
    fg[i] = gr > 90 && gr > r * 1.35 && gr > b * 1.35 ? 0 : 1;
  }
  // Columns with figure pixels, grouped into runs separated by green gaps.
  const col = new Array(W).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) col[x] += fg[y * W + x];
  const runs: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= W; x++) {
    const on = x < W && col[x] > 2;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      if (x - start > 4) runs.push([start, x - 1]);
      start = -1;
    }
  }
  if (runs.length < 4) return null;
  const four = runs.sort((a, b) => b[1] - b[0] - (a[1] - a[0])).slice(0, 4).sort((a, b) => a[0] - b[0]);

  const box = ([x0, x1]: [number, number]) => {
    let top = H, bottom = 0;
    for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) if (fg[y * W + x]) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    return { x0, x1, top, bottom };
  };
  const boxes = four.map(box);
  // Facing: centroid of the feet and of the head, relative to the torso's.
  const facing = (b: ReturnType<typeof box>) => {
    const cx = (y0: number, y1: number) => {
      let s = 0, n = 0;
      for (let y = Math.round(y0); y < y1; y++) for (let x = b.x0; x <= b.x1; x++) if (fg[y * W + x]) { s += x; n++; }
      return n ? s / n : 0;
    };
    const h = b.bottom - b.top;
    const torso = cx(b.top + h * 0.3, b.top + h * 0.55);
    const feet = cx(b.bottom - h * 0.06, b.bottom + 1);
    const head = cx(b.top, b.top + h * 0.1);
    return feet - torso + (head - torso) * 0.5; // > 0: faces the image's right
  };
  // Order on the sheet is front, side, back, side; which side is which comes from facing.
  // Seen from the person's left (+x, angle +90°) they face your left (the image's left).
  const sideA = facing(boxes[1]) < 0 ? Math.PI / 2 : -Math.PI / 2;
  const angles = [0, sideA, Math.PI, -sideA];

  const pad = 4;
  const rects = boxes.map((b) => {
    const x0 = Math.max(0, b.x0 - pad), x1 = Math.min(W - 1, b.x1 + pad);
    const y0 = Math.max(0, b.top - pad), y1 = Math.min(H - 1, b.bottom + pad);
    const k = HEIGHT_M / (b.bottom - b.top);
    return { u0: x0 / W, u1: (x1 + 1) / W, v0: 1 - (y1 + 1) / H, v1: 1 - y0 / H, w: (x1 + 1 - x0) * k, h: (y1 + 1 - y0) * k, feet: (y1 + 1 - b.bottom) * k };
  });
  return { angles, rects };
}

const vert = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// Green-screen key with spill removal. The sheet stays in sRGB end to end (no conversion).
const frag = /* glsl */ `
uniform sampler2D map; uniform vec4 rect; uniform float opacity; varying vec2 vUv;
void main() {
  vec4 c = texture2D(map, vec2(mix(rect.x, rect.z, vUv.x), mix(rect.y, rect.w, vUv.y)));
  float spill = c.g - max(c.r, c.b);
  float a = 1.0 - smoothstep(0.06, 0.22, spill);
  c.g = min(c.g, max(c.r, c.b) * 1.04);
  if (a * opacity < 0.03) discard;
  gl_FragColor = vec4(c.rgb, a * opacity);
}`;

function ViewPlane({ tex, rect, opacity, z }: { tex: THREE.Texture; rect: Rect; opacity: number; z: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { map: { value: tex }, rect: { value: new THREE.Vector4() }, opacity: { value: 1 } },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
      }),
    [tex],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  mat.uniforms.rect.value.set(rect.u0, rect.v0, rect.u1, rect.v1);
  mat.uniforms.opacity.value = opacity;
  return (
    <mesh position={[0, rect.h / 2 - rect.feet, z]} scale={[rect.w, rect.h, 1]} material={mat} raycast={() => undefined}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

/** `facing`: the world direction the person faces at first (radians around Y; 0 = +Z, π = toward the room's start). */
export function Statue({
  sheet,
  position,
  facing = 0,
  onUnusable,
}: {
  sheet: string;
  position: [number, number, number];
  facing?: number;
  onUnusable?: () => void; // the sheet doesn't show four separate figures
}) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let dead = false;
    let loaded: THREE.Texture | undefined;
    new THREE.TextureLoader().load(sheet, (t) => {
      if (dead) return t.dispose();
      t.colorSpace = THREE.NoColorSpace; // keyed in the shader, passed through as sRGB
      t.minFilter = THREE.LinearFilter;
      loaded = t;
      setTex(t);
    });
    return () => {
      dead = true;
      loaded?.dispose();
    };
  }, [sheet]);
  const views = useMemo(() => (tex ? analyzeSheet(tex.image as HTMLImageElement) : null), [tex]);
  useEffect(() => {
    if (tex && !views) onUnusable?.();
  }, [tex, views, onUnusable]);

  const camera = useThree((s) => s.camera);
  const session = useXR((s) => s.session);
  const group = useRef<THREE.Group>(null);
  const spin = useRef(facing); // which way the person faces; the left thumbstick turns it
  const [blend, setBlend] = useState<{ a: number; b: number; t: number }>({ a: 0, b: 0, t: 0 });
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    if (!views || !group.current) return;
    for (const src of session?.inputSources ?? []) {
      const x = src.handedness === "left" ? (src.gamepad?.axes[2] ?? 0) : 0;
      if (Math.abs(x) > 0.15) spin.current += x * dt * 1.6;
    }
    camera.getWorldPosition(tmp);
    const dx = tmp.x - position[0];
    const dz = tmp.z - position[2];
    const toViewer = Math.atan2(dx, dz); // world angle of the viewer around the statue
    group.current.rotation.y = toViewer; // the cut-out always faces you
    // Which side of the person you're seeing: viewer angle relative to where they face.
    const rel = toViewer - spin.current;
    const dist = views.angles.map((a) => Math.abs(Math.atan2(Math.sin(rel - a), Math.cos(rel - a))));
    const order = dist.map((d, i) => [d, i]).sort((p, q) => p[0] - q[0]);
    const [d0, i0] = order[0];
    const [d1, i1] = order[1];
    const t = d0 + d1 > 0 ? d0 / (d0 + d1) : 0; // 0 = all nearest view
    if (i0 !== blend.a || i1 !== blend.b || Math.abs(t - blend.t) > 0.02) setBlend({ a: i0, b: i1, t });
  });

  if (!tex || !views) return null;
  const rects = views.rects;
  // t runs 0 (squarely in front of one view) to 0.5 (halfway between two). Cross-fade
  // only over the middle of the turn, so each view shows cleanly most of the way.
  const mix = 0.5 * THREE.MathUtils.smoothstep(blend.t, 0.25, 0.5);
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} raycast={() => undefined}>
        <circleGeometry args={[0.45, 40]} />
        <meshStandardMaterial color="#a8a29e" />
      </mesh>
      <group ref={group}>
        <ViewPlane tex={tex} rect={rects[blend.a]} opacity={1} z={0} />
        {mix > 0.01 && <ViewPlane tex={tex} rect={rects[blend.b]} opacity={mix} z={0.002} />}
      </group>
    </group>
  );
}
