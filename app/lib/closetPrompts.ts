// Orbis prompts for the fitting room, written to the Orbis prompt guide:
// - first prompt builds the world: WHO does WHAT at WHERE + camera
// - follow-ups describe only what visibly changes, one action at a time
// - location changes are bridged by walking somewhere, never a hard cut
// - no negation, no "cinematic"-style intent adjectives

function subject(avatarDescription: string): string {
  const d = avatarDescription.trim().replace(/\.$/, "");
  return /^(a|an|the)\s/i.test(d) ? d[0].toUpperCase() + d.slice(1) : `A ${d}`;
}

export function initialPrompt(avatarDescription: string, garmentDescription: string): string {
  const garment = garmentDescription.trim().replace(/\.$/, "");
  return (
    `${subject(avatarDescription)}, wearing ${garment}, stands in a bright minimalist boutique fitting room ` +
    `with a pale wood floor and a soft beige curtain, gently shifting their weight and looking at the camera. ` +
    `Full body, medium wide shot, eye-level, static camera, deep depth of field.`
  );
}

export type Steer = { label: string; text: string };

export const POSE_STEERS: Steer[] = [
  { label: "Turn around", text: "The person turns slowly in place to show the back of the outfit." },
  { label: "Face me", text: "The person turns back to face the camera and smiles." },
  { label: "Walk closer", text: "The person walks slowly toward the camera, stopping in a medium shot." },
  { label: "Step back", text: "The person steps back to the middle of the room, full body in frame." },
  { label: "Arms out", text: "The person raises their arms slightly to the sides to show the fit of the sleeves." },
];

export const PLACE_STEERS: Steer[] = [
  {
    label: "Rainy street",
    text: "The person pulls back the curtain and walks out onto a rainy city street at dusk, wet pavement reflecting shop lights.",
  },
  {
    label: "Dinner",
    text: "The person walks through a doorway into a warmly lit restaurant at night and stops beside a table.",
  },
  {
    label: "Beach",
    text: "The person walks out onto a sunny beach boardwalk with the ocean and blue sky behind them.",
  },
  {
    label: "Office",
    text: "The person walks into a bright modern office with glass walls and stands near a desk.",
  },
  {
    label: "Fitting room",
    text: "The person walks back into the bright boutique fitting room and stands facing the camera.",
  },
];

/** Minimum gap between steering prompts; changes take 2–4 s to land. */
export const STEER_GAP_MS = 3500;
