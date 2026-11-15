// Orbis prompts for the fitting room, written to the Orbis prompt guide:
// - first prompt builds the world: WHO does WHAT at WHERE + camera
// - one action at a time; location changes morph the background (camera stays fixed)
// - no negation, no "cinematic"-style intent adjectives

function subject(avatarDescription: string): string {
  const d = avatarDescription.trim().replace(/\.$/, "");
  return /^(a|an|the)\s/i.test(d) ? d[0].toUpperCase() + d.slice(1) : `A ${d}`;
}

/** "a, b and c" from garment descriptions. */
export function outfitPhrase(garmentDescriptions: string[]): string {
  const parts = garmentDescriptions.map((g) => g.trim().replace(/\.$/, "")).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

// Follow-up prompts (steers) describe only what changes: Orbis keeps the person,
// outfit and setting from earlier prompts. Learned in testing:
// - re-sending the whole scene made it cut to a new shot (close-ups, another room)
// - "looking at the camera" in the opening prompt made the person drift into a
//   close-up within ~10 s, even with no steering
// - "walks toward the camera" / "walks out onto the street" moved the camera
// - fast moves ("spins around") fall apart; slow ones hold together. Even a slow full
//   turn ("twirl") didn't hold up on the headset, so it was removed.
// So every steer keeps the person on the same spot, moves slowly, and ends with the camera.
/** Appended to every prompt sent to Orbis after the first: the person stays on their mark. */
export const KEEP_IN_PLACE =
  "The person stays on the same spot in the centre of the frame at the same distance, full body visible head to toe. Static camera.";
const HOLD = KEEP_IN_PLACE;

/** `place`: where they are, when a run is restarted somewhere other than the fitting room. */
export function initialPrompt(avatarDescription: string, garmentDescriptions: string[], place?: string): string {
  const where = place ? `in this setting: ${place},` : "in a bright minimalist boutique fitting room with a pale wood floor and a soft beige curtain,";
  const wearing = garmentDescriptions.length ? `, wearing ${outfitPhrase(garmentDescriptions)},` : "";
  return (
    `${subject(avatarDescription)}${wearing} stands ${where} ` +
    `posing on the spot for a full-length photo. ` +
    `Full body head to toe, wide shot, eye-level, static camera, deep depth of field.`
  );
}

/** A free-form steer typed by the user, with the camera held. */
export function customPrompt(text: string): string {
  return `${text.trim().replace(/\.$/, "")}. ${HOLD}`;
}

export type Steer = { label: string; text: string; place?: string }; // place: set for location steers

const pose = (label: string, action: string): Steer => ({ label, text: `The person ${action}, standing on the same spot. ${HOLD}` });
const place = (label: string, where: string): Steer => ({
  label,
  place: where,
  text: `The background behind the person becomes ${where}, while they stand on the same spot. ${HOLD}`,
});

// Poses happen in place, to show the outfit off.
export const POSE_STEERS: Steer[] = [
  pose("Face me", "turns to face forward and smiles"),
  pose("Turn around", "turns slowly to show the back of the outfit"),
  pose("Strike a pose", "puts one hand on their hip and strikes a confident model pose"),
  pose("Arms out", "raises their arms slightly to the sides to show the fit of the sleeves and waist"),
];

// Places change the background; the person and the camera stay put.
export const PLACE_STEERS: Steer[] = [
  place("Rainy street", "a rainy city street at dusk, wet pavement reflecting shop lights"),
  place("Dinner", "a warmly lit restaurant at night"),
  place("Beach", "a sunny beach boardwalk with the ocean and blue sky"),
  place("Office", "a bright modern office with glass walls"),
  place("Fitting room", "the bright boutique fitting room with the soft beige curtain"),
];

/** Minimum gap between steering prompts; changes take 2–4 s to land. */
export const STEER_GAP_MS = 3500;
