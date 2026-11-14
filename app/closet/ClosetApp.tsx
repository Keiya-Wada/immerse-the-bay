"use client";

import { useState } from "react";
import { ViskoOrbisStableProvider } from "@reactor-models/visko-orbis-stable";
import { fetchToken } from "../lib/token";
import { fit16x9, useCloset, type Item } from "../lib/closet";
import { initialPrompt } from "../lib/closetPrompts";
import {
  sendReset,
  sendSetImage,
  sendSetPrompt,
  sendStart,
  useViskoOrbisStable,
  useViskoState,
  type StateMessage,
} from "../lib/visko";
import { StatusBadge } from "../components/StatusBadge";
import { Video } from "../components/Video";
import { AvatarPanel } from "./AvatarPanel";
import { ClosetPanel } from "./ClosetPanel";
import { SteerPanel } from "./SteerPanel";

export function ClosetApp() {
  return (
    <ViskoOrbisStableProvider jwtToken={fetchToken}>
      <Closet />
    </ViskoOrbisStableProvider>
  );
}

function Closet() {
  const s = useViskoOrbisStable();
  const avatar = useCloset((st) => st.avatar);
  const setWearing = useCloset((st) => st.setWearing);
  const [snap, setSnap] = useState<StateMessage | null>(null);
  const [wearError, setWearError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  useViskoState((m: StateMessage) => setSnap(m));

  const ready = s.status === "ready";

  // New outfit = new Orbis run: reset → upload the try-on photo → setImage →
  // setPrompt → start. (An image can only be set before `start`.)
  async function wear(item: Item) {
    if (!avatar || !item.tryOn) return;
    setSwitching(true);
    setWearError(null);
    try {
      if (snap?.started) await sendReset(s);
      const blob = await fit16x9(item.tryOn.image);
      const ref = await s.uploadFile(blob, { name: `${item.id}.jpg` });
      await sendSetImage(s, ref);
      await sendSetPrompt(s, initialPrompt(avatar.description, item.tryOn.garmentDescription));
      await sendStart(s);
      setWearing(item.id);
    } catch (e) {
      setWearError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-4 py-3 lg:px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-tight text-zinc-100">Fitting Room</h1>
          <span className="hidden border-l border-zinc-800 pl-3 text-[11px] uppercase tracking-wider text-zinc-500 sm:inline">
            Try anything on, then take it anywhere
          </span>
        </div>
        <a href="/studio" className="text-[11px] uppercase tracking-wider text-zinc-500 hover:text-brand">
          Orbis sandbox
        </a>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 lg:h-full lg:flex-row lg:gap-6 lg:overflow-hidden lg:p-6">
        <aside className="flex w-full flex-col gap-4 lg:h-full lg:w-96 lg:shrink-0 lg:overflow-y-auto">
          <AvatarPanel />
          <ClosetPanel onWear={wear} canWear={ready && !switching} />
        </aside>
        <section className="order-first flex min-w-0 flex-1 flex-col gap-4 lg:order-none">
          <StatusBadge />
          {wearError && <p className="text-xs text-red-400">Couldn&apos;t start the mirror: {wearError}</p>}
          <div className="min-h-0 flex-1">
            <Video />
          </div>
          <SteerPanel running={!!snap?.running} paused={!!snap?.paused} />
        </section>
      </main>
    </div>
  );
}
