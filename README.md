# Fitting Room (Immerse the Bay 2026)

Track: **Visko Living Worlds**. Describe an avatar, add clothes from a product link, a photo or a description,
and watch the avatar wear them in a live **Visko Orbis** video you can steer: turn around, walk closer, or take
the outfit to a rainy street or a dinner.

Target device: **Meta Quest 2** (WebXR in the Quest Browser).

## How it works
```
describe avatar ──▶ /api/avatar  ──▶ Gemini (Vertex AI) ──▶ 16:9 avatar photo (saved)
add clothes    ──▶ /api/closet  ──▶ saved to data/closet/, sorted by Gemini (category, type, name)
                   (photos: pick many / drop / paste; product link via /api/ingest; or a description)
"Try on"       ──▶ /api/tryon   ──▶ Gemini edits the avatar photo to wear the item
"Wear in mirror"──▶ Orbis: reset → uploadFile → setImage → setPrompt → start   (live video)
steer buttons  ──▶ Orbis setPrompt (one change every few seconds)
"Enter VR"     ──▶ same closet + Orbis session, drawn as a 3D room (React Three Fiber + WebXR)
```

Outfits stack: each "put on" edits the current outfit photo, so pieces combine. A new top replaces the old
top, a dress replaces top and bottom, and coats and accessories go on over everything else.

| Path | What |
|---|---|
| `app/page.tsx`, `app/closet/` | Fitting room UI (avatar, closet, mirror, steering) |
| `app/api/avatar`, `app/api/tryon` | Gemini on Vertex AI (`app/lib/gemini.ts`) |
| `app/api/ingest` | Reads product pages (JSON-LD / Open Graph) |
| `app/api/closet`, `app/lib/wardrobe.ts` | Saved closet + avatar on the server's disk (`data/`, git-ignored) |
| `app/api/reactor/token` | Swaps the Reactor key for a short-lived browser token |
| `app/lib/closetPrompts.ts` | Orbis prompts and steering presets |
| `app/vr/VRRoom.tsx` | VR room: live mirror, closet rail, outfit stand, steering desk |
| `app/lib/steer.ts` | Steering rate limit shared by the 2D panel and VR |
| `app/studio` | The original Orbis template, kept as a sandbox |

Setup: [docs/SETUP.md](docs/SETUP.md). Plan and notes from earlier ideas: [docs/archive/](docs/archive/).

## Status
- [x] Orbis template, token route, sandbox at `/studio`
- [x] Avatar from a description, product links, try-on images (Gemini on Vertex AI)
- [x] 2D fitting room: wear in mirror, live steering, manual pause
- [x] Combine pieces into an outfit (put on / take off / redo last)
- [x] Saved closet: add once, browse by category/type/search, shared by every device (incl. the Quest)
- [x] VR room step 1: Enter VR, live mirror (video texture), closet rail, outfit stand, steering desk, controller input
- [ ] VR on a real Quest 2 (tested so far only in the headset emulator)
- [ ] Voice steering
- [ ] Deploy to Vercel for the demo

## VR notes
- Set up the avatar and closet on the flat page, then press **Enter VR** (Quest Browser over HTTPS: `npm run quest`).
- On `localhost` without a headset, Enter VR opens a Quest emulator in the browser (Chrome/Edge: it only
  injects when the browser has no WebXR of its own). `package.json` pins one copy of three.js
  (`overrides`) because the emulator's own copy breaks rendering otherwise.
- **Passthrough** (Quest 3, `immersive-ar`) shows the same room without the walls and floor, so your double
  stands in your real room. The desk's Closer / Farther / Size buttons fit it to the space.
- The video is shown as a life-size "double" (a 2.25 m tall frame standing on the floor, edges faded), not a
  mirror: Orbis takes 2–4 s to react, which reads as a bug in a mirror but as a response from a double.
- VR buttons fire on trigger *release* over the same button (the built-in click ignores presses over 300 ms)
  and give a short controller vibration on press.
- Orbis steering, learned in testing: the opening prompt must not say "looking at the camera" (the person
  drifts into a close-up within ~10 s); follow-ups should describe only the change (re-sending the whole
  scene cuts to a new shot), keep the person on the spot, and move slowly. It's still not fully reliable:
  big moves can lose parts of the outfit.
- Steering presses during a change are queued (the latest wins), not ignored; failures are shown.
- Two status lines on the desk show whether the video is live (fps, resolution, stalls) and what happened
  to the last steer. If frames stop for 5 s while the stream is live, the video element is rebuilt.
- Orbis runs as much as possible: the video starts by itself once you connect (the avatar as is, or the
  outfit if one is built), never auto-pauses (only the Pause button stops it), generates its audio track
  too (never played), and runs at 4k on a laptop / 2k in a headset (falls back to the next tier if refused).
- The VR double uploads a video frame to the GPU only when a new one arrives.

## Running for a demo
- Production build (no on-demand compiling, steadier): `npm run build && npm start`, then `npm run quest` for the
  Quest link. After code changes, build and restart again.
- `npm run dev:test` runs a dev server on port 3001 (separate build folder) next to it, for testing.

## Keeping the double in place (the director)
- Orbis drifts: within ~20–30 s the double tends to come toward the camera until the feet, then the legs, are cut off.
- Every steer (buttons, typed, voice) goes through `/api/director` first: Gemini looks at the current video frame and
  writes the Orbis prompt, always ending with the keep-in-place sentence (`KEEP_IN_PLACE` in `closetPrompts.ts`);
  if the frame shows drift, the prompt starts with a correction.
- **Keep in place** (on by default; checkbox under the steer buttons) checks a frame every 8 s. Mild drift gets a
  "stand still, small in frame" prompt; if it's severe (face/upper body only) or still there on the next check,
  the run is restarted from the outfit photo (~3 s of black). If you'd steered somewhere (the beach), Gemini first
  redraws the outfit photo in that place (`/api/restage`), so the restart keeps the location.
- Learned: "walk back to centre" makes Orbis move the camera through the room, so corrections never say walk/step/move.
  Prompt-only corrections rarely undo a close-up; the restart is what reliably fixes framing.
- Decisions are logged as `[director] …` in the server output.

## Voice, photo quality and the statue
- **Voice:** hold **🎤 Hold to talk** on the page, or **A / X** on a controller in VR, and speak. One Gemini call
  (`/api/voice`) transcribes it and maps it onto your closet and the steer presets: "let's try the brown henley
  with the black jeans" dresses that outfit (and puts it on the live video if it's connected), "add the
  sunglasses", "take off the jacket", "turn around", "take me somewhere snowy", "save this look", "pause".
  Pieces you don't own are reported ("Not in your closet: loafers"). On the Quest, allow the mic on the page
  once before entering VR.
- **Photos: Fast / Best quality** switches the try-on and avatar image model between `gemini-2.5-flash-image`
  (~12 s) and `gemini-3-pro-image` (~16–18 s; better fabric, prints and faces). Remembered per browser.
- **Rate limits:** this project's quota for the fast image model is small (a third photo within seconds gets
  a 429). `generateImage` then tries `gemini-3.1-flash-image`, then the pro model, then waits and retries
  (up to ~20 s), so outfits built by voice don't fail halfway. Failures are logged as `[api error]` in the
  server output.
- **3D statue:** Gemini's pro image model draws the outfit from four sides on a green screen
  (`/api/statue`); in VR it stands behind you as a life-size cut-out that shows the side you're facing
  (`app/vr/Statue.tsx`). It's view-switching, not a true mesh: diagonals cross-fade. A real mesh would need an
  image-to-3D service (Meshy, Tripo, fal.ai…) and its API key.

## Closet notes
- Items and the avatar are saved in `data/` next to the app (git-ignored; it holds your photos). Back it up
  or delete it like any folder. Because it's on the server's disk, it works for `npm run dev` / `npm start`
  on your machine; a Vercel deploy would need real storage (e.g. Vercel Blob) instead.
- **Saved looks** (`data/looks/`) keep every layer photo of an outfit, so a look can be compared, put back
  on and edited without re-generating anything. In VR they're on the shelf to your left; Compare stands the
  saved look life-size next to your live double.
- Remove an item with the ✕ on its card (tap twice), on the page or on the VR rail.
- Product links: many big stores (Uniqlo, H&M, Levi's, J.Crew, Zara, Amazon…) block server requests with bot
  protection, so their links fail. Copy the product photo and paste it (⌘V) instead.
- Adding an item makes one Gemini text call to sort it. If Gemini is busy the item is saved as "Unsorted"
  and gets sorted on its first try-on; the ⋯ menu on each item fixes a category, type or name by hand.
