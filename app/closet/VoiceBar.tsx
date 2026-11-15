"use client";

import { useVoice, voiceStart, voiceStop } from "../lib/voice";

/** Hold-to-talk button plus what was heard and done. */
export function VoiceBar() {
  const { phase, transcript, result, error } = useVoice();
  const listening = phase === "listening";
  return (
    <section className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5">
      <button
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          void voiceStart();
        }}
        onPointerUp={() => void voiceStop()}
        onPointerCancel={() => void voiceStop()}
        onContextMenu={(e) => e.preventDefault()}
        disabled={phase === "thinking"}
        className={`shrink-0 select-none rounded-full px-4 py-2 text-xs font-medium touch-none ${
          listening ? "bg-red-500 text-white" : "bg-brand text-brand-fg hover:opacity-90"
        } disabled:opacity-50`}
      >
        {listening ? "● Listening… release to send" : phase === "thinking" ? "Thinking…" : "🎤 Hold to talk"}
      </button>
      <div className="min-w-0 flex-1 text-xs leading-snug">
        {error ? (
          <p className="text-red-400">{error}</p>
        ) : transcript || result ? (
          <>
            {transcript && <p className="truncate text-zinc-400">“{transcript}”</p>}
            {result && <p className="truncate text-zinc-200">{result}</p>}
          </>
        ) : (
          <p className="text-zinc-500">
            Try “let&apos;s try the red sweater with blue jeans”, “add the loafers”, “turn around”, “take me to the beach”, “save this look”.
          </p>
        )}
      </div>
    </section>
  );
}
