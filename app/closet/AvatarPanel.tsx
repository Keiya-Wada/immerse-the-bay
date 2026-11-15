"use client";

import { useEffect, useState } from "react";
import { postJson, useCloset } from "../lib/closet";

const EXAMPLES = [
  "woman in her late 20s with curly black shoulder-length hair, warm brown skin, tall and slim",
  "man in his 40s with short grey hair and a trimmed beard, broad shoulders, medium height",
  "non-binary person in their early 20s with a pink buzz cut, pale freckled skin, petite build",
];

export function AvatarPanel() {
  const avatar = useCloset((s) => s.avatar);
  const setAvatar = useCloset((s) => s.setAvatar);
  const [text, setText] = useState(avatar?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The saved avatar arrives after the first render: show its description.
  useEffect(() => {
    if (avatar?.description) setText((t) => t || avatar.description);
  }, [avatar?.description]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await postJson<{ image: string; description: string }>("/api/avatar", { description: text, quality: useCloset.getState().quality });
      setAvatar({ image: r.image, description: r.description });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <h2 className="text-[10px] uppercase tracking-wider text-zinc-500">1 · Your avatar</h2>
      <textarea
        id="avatar-description"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Describe who's trying the clothes on: age, hair, skin tone, build…"
        className="mt-2 w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 p-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand focus:outline-none"
      />
      <div className="mt-1 flex flex-wrap gap-1">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setText(ex)}
            className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:border-brand hover:text-brand"
          >
            {ex.split(" with ")[0]}
          </button>
        ))}
      </div>
      <button
        onClick={generate}
        disabled={busy || !text.trim()}
        className="mt-2 w-full rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
      >
        {busy ? "Creating avatar… (~10 s)" : avatar ? "Recreate avatar" : "Create avatar"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {avatar && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar.image} alt="Your avatar" className="mt-2 aspect-video w-full rounded-md object-cover" />
      )}
    </section>
  );
}
