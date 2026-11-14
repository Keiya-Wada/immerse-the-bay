# Virtuous Reality: idea shortlist

Judging is **social impact**, so each pitch needs: a specific group of people, a real problem they have, and a demo moment a judge can feel in 30 seconds.

## 1. Shake Ready: earthquake prep in your own room ⭐
Mixed-reality app that scans your actual room (Quest scene mesh / plane detection), flags hazards (tall unanchored shelf, mirror over the bed, blocked exit), then runs a simulated quake drill: objects in the scan topple, and you practice drop-cover-hold and finding your exit.
- **Who:** Bay Area renters, students in dorms, families.
- **Demo moment:** the judge's own booth shakes and the bookshelf they're standing next to falls on their virtual head.
- **Stack:** Unity + Meta XR SDK (MRUK for scene understanding), or WebXR with plane detection.
- **Cut scope:** hazard rules hard-coded per furniture label; one drill scenario.
- **Second track:** AI Horizons if an LLM/vision model writes a personalised "fix list" from the scan.

## 2. SignBridge: live ASL ↔ speech captions
Hand tracking reads a small vocabulary of ASL signs and speaks them aloud; speech-to-text puts captions floating next to whoever is talking.
- **Who:** Deaf / hard-of-hearing people in everyday conversations with hearing people.
- **Demo moment:** a two-person conversation with no interpreter.
- **Stack:** Quest hand-tracking joint data → small classifier; Whisper or a cloud STT for captions.
- **Cut scope:** 15–20 signs, fingerspelling optional. Talk to Deaf users / say how you'd involve them; judges will ask.
- **Second track:** AI Horizons.

## 3. Clear Path: low-vision navigation aid
Passthrough overlay that boosts edges and contrast, highlights steps and obstacles, and uses spatial audio pings for things in your path. Voice command "what's in front of me?" sends a frame to a vision model.
- **Who:** people with low vision (glaucoma, macular degeneration).
- **Demo moment:** blur-goggle mode for the judge, then toggle the aid on.
- **Stack:** Quest passthrough camera API or Vision Pro; vision LLM for descriptions.
- **Second track:** AI Horizons.

## 4. First Words: rehearsal for high-stakes conversations
Practice a doctor's appointment, DMV visit, or job interview with an AI character, in a realistic room, at your language level, with gentle feedback afterward.
- **Who:** recent immigrants and refugees, ESL learners, people with social anxiety.
- **Demo moment:** the judge fumbles a pharmacy conversation, then sees a replay with suggested phrases.
- **Stack:** Unity/WebXR + STT → LLM → TTS; one scene.

## 5. ReachBack: gamified stroke rehab with clinician data
Hand-tracked mini-games (pick fruit, stack cups) tuned to a patient's range of motion, logging reach and grip metrics to a dashboard a therapist can read.
- **Who:** stroke survivors doing home therapy, where most people quit the exercises.
- **Demo moment:** play the game, then show the progress chart it produced.

## 6. Tide Line: see sea-level rise where you stand
AR overlay of projected 2050/2100 flood levels at real Bay Area locations (NOAA data), with what the city plans to do about it.
- **Who:** residents and local decision-makers.
- **Risk:** hard to demo indoors; needs a pre-recorded or tabletop map version.

---

## Recommendation
**#1 Shake Ready** has the strongest local tie-in, the most visceral demo, and it uses the headset's room scanning in a way a phone can't. **#2 SignBridge** has the biggest impact but the most risk: sign recognition from hand tracking is hard to get working in 36 hours.

## Before you commit
- [ ] What hardware is available (Quest 3, Vision Pro, Snap Spectacles)?
- [ ] Team skills: Unity/C#, or web (WebXR / three.js)?
- [ ] Can you talk to one real user from the target group during the event?
