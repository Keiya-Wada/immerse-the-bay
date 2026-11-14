# Rental hardware guide

Full visual version: https://claude.ai/artifact/TA2gULSmrC9XZoB95PCvjv (private; share from the page to give teammates access).

## At a glance

| Device | Type | How you see the world | Hand tracking | Standalone? | Dev tools | Difficulty |
|---|---|---|---|---|---|---|
| **Meta Quest 3S** | MR headset | Color passthrough | Good | Yes | Unity + Meta XR SDK, WebXR | Easy |
| Meta Quest 2 | VR headset | Grainy B&W passthrough | Good | Yes | Unity + Meta XR SDK, WebXR | Easy |
| Pico 4 | MR headset | Color passthrough (some warping) | OK | Yes | Unity + Pico SDK / OpenXR, WebXR | Medium |
| Snap Spectacles | See-through AR glasses | Optical, ~46° FOV | Good | Yes | Lens Studio (TypeScript) | Medium |
| XREAL Air 2 Ultra | See-through AR glasses | Optical, dimmed | Basic | Tethered to phone/Beam Pro | Unity + XREAL SDK (Android) | Hard |
| Mentra Live | AI camera glasses | No display, audio only | None | Needs phone | MentraOS SDK (TypeScript) | Easy |
| Meta Adventurers | Unclear, likely Meta camera glasses | Ask organizers | ? | ? | ? | Unknown |
| OpenBCI Ultracortex | EEG headset | Not a display | None | Needs laptop | OpenBCI GUI, BrainFlow (Python), LSL | Hard |

## Device notes

**Meta Quest 3S**: best all-rounder.
- Good for: mixed reality in your real room (room scan, placing content on walls/furniture), controller-free hand tracking, raw camera access (Passthrough Camera API) for AI vision, huge tutorial base.
- Cons: blurrier lenses than Quest 3, no depth sensor so room scans are less precise, front-heavy, needs Meta account + developer mode set up.

**Meta Quest 2**: fallback for fully virtual scenes.
- Good for: empathy sims, training rooms, conversation practice. Same tools as Quest 3S.
- Cons: B&W passthrough, no camera access, slower and lower resolution.

**Pico 4**: only if Quests run out.
- Good for: comfort (battery in back strap), sharp wide lenses, standard OpenXR.
- Cons: far fewer tutorials and mentors, weaker passthrough and room understanding.

**Snap Spectacles**: best for outdoor or walk-around AR.
- Good for: outdoor demos (lenses tint), multiplayer (Connected Lenses), built-in hand tracking/speech/AI hooks, fast wireless iteration.
- Cons: small field of view, ~45 min battery and gets warm, Lens Studio is a new tool if you only know Unity.

**XREAL Air 2 Ultra Kit**: riskiest to develop on.
- Good for: light, wearable for a long time, big virtual screens / HUDs, 6DoF tracking.
- Cons: always cabled, basic hand tracking and room understanding, washes out in bright light, small community and fiddly Android builds.

**Mentra Live**: best for accessibility.
- Good for: AI that sees what you see (describe scenes, read signs), blind/low-vision users, live transcription/translation. Apps are TypeScript servers.
- Cons: no display, so the pitch must explain why it's XR; depends on phone + event wifi; newer SDK.

**Meta Adventurers**: confirm first. Ask which glasses these are, whether they have a display, and whether third-party apps can run on them (Meta Wearables Device Access Toolkit).

**OpenBCI Ultracortex**: Wild West track.
- Good for: neurofeedback (calm/focus driving a scene), simple brain inputs (alpha waves, SSVEP), hands-free accessibility.
- Cons: noisy signals (blinks, jaw, venue noise), slow electrode fitting, collides with VR headset straps, needs signal-processing skills.

## Matched to our ideas

| Idea | Best fit | Alternatives |
|---|---|---|
| Shake Ready (earthquake prep) | Quest 3S | Pico 4, Quest 2 (weak) |
| SignBridge (ASL captions) | Quest 3S | Spectacles |
| Clear Path (low-vision aid) | Mentra Live | Quest 3S |
| First Words (conversation practice) | Quest 3S / Quest 2 | Mentra Live |
| ReachBack (stroke rehab) | Quest 3S | + OpenBCI for Wild West |
| Tide Line (sea-level rise) | Spectacles | Quest 3S tabletop version |

## Recommendation
Rent a **Quest 3S**. If you can rent a second device, a **Mentra Live** or **Spectacles** gives a backup idea a headset can't do. Only pick the OpenBCI if someone has EEG or signal-processing experience.

_Specs from general knowledge; confirm exact models and accessories with the rental desk._
