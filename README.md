# Fitting Room (Immerse the Bay 2026)

Track: **Visko Living Worlds**. Describe an avatar, add clothes from a product link, a photo or a description,
and watch the avatar wear them in a live **Visko Orbis** video you can steer: turn around, walk closer, or take
the outfit to a rainy street or a dinner.

Target device: **Meta Quest 2** (WebXR in the Quest Browser).

## How it works
```
describe avatar ──▶ /api/avatar  ──▶ Gemini (Vertex AI) ──▶ 16:9 avatar photo
product link   ──▶ /api/ingest  ──▶ product name + photo from the store page
"Try on"       ──▶ /api/tryon   ──▶ Gemini edits the avatar photo to wear the item
"Wear in mirror"──▶ Orbis: reset → uploadFile → setImage → setPrompt → start   (live video)
steer buttons  ──▶ Orbis setPrompt (one change every few seconds)
```

| Path | What |
|---|---|
| `app/page.tsx`, `app/closet/` | Fitting room UI (avatar, closet, mirror, steering) |
| `app/api/avatar`, `app/api/tryon` | Gemini on Vertex AI (`app/lib/gemini.ts`) |
| `app/api/ingest` | Reads product pages (JSON-LD / Open Graph) |
| `app/api/reactor/token` | Swaps the Reactor key for a short-lived browser token |
| `app/lib/closetPrompts.ts` | Orbis prompts and steering presets |
| `app/studio` | The original Orbis template, kept as a sandbox |

Setup: [docs/SETUP.md](docs/SETUP.md). Plan and notes from earlier ideas: [docs/archive/](docs/archive/).

## Status
- [x] Orbis template, token route, sandbox at `/studio`
- [x] Avatar from a description, product links, try-on images (Gemini on Vertex AI)
- [x] 2D fitting room: wear in mirror, live steering, pause when hidden
- [ ] VR fitting room on Quest 2 (mirror as a video texture, closet rail, controller input)
- [ ] Voice steering
- [ ] Deploy to Vercel for the demo
