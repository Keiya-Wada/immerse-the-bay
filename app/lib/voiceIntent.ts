// What a spoken command means (returned by /api/voice, carried out by lib/voice.ts).
export type VoiceIntent =
  | { kind: "outfit"; mode: "replace" | "add" | "remove"; itemIds: string[]; missing: string[] }
  | { kind: "pose"; label: string }
  | { kind: "place"; label: string }
  | { kind: "custom"; text: string }
  | { kind: "save_look" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "none"; reply: string };
