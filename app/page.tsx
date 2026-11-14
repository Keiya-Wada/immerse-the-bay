import { ClosetApp } from "./closet/ClosetApp";
import { SetupRequired } from "./SetupRequired";

// Main app: the fitting room. /studio keeps the original Orbis template as a
// sandbox for testing prompts by hand.
export const dynamic = "force-dynamic";

export default function Page() {
  return process.env.REACTOR_API_KEY ? <ClosetApp /> : <SetupRequired />;
}
