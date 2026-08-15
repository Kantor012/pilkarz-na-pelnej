import { advanceWorldWeek } from "./world";
import type { WorldState } from "./types";

export async function advanceWorldWeekAsync(world: WorldState, focusLeagueId: string, excludedFixtureId?: string) {
  if (typeof Worker === "undefined") return advanceWorldWeek(world, focusLeagueId, excludedFixtureId);
  const worker = new Worker(new URL("./world-simulation.worker.ts", import.meta.url), { type: "module" });
  const id = `world-${world.season}-${world.round}-${Date.now()}`;
  return new Promise<WorldState>((resolve) => {
    const fallback = window.setTimeout(() => {
      worker.terminate();
      resolve(advanceWorldWeek(world, focusLeagueId, excludedFixtureId));
    }, 2500);
    worker.onmessage = (event: MessageEvent<{ id: string; world?: WorldState; error?: string }>) => {
      if (event.data.id !== id) return;
      window.clearTimeout(fallback);
      worker.terminate();
      resolve(event.data.world ?? advanceWorldWeek(world, focusLeagueId, excludedFixtureId));
    };
    worker.onerror = () => {
      window.clearTimeout(fallback);
      worker.terminate();
      resolve(advanceWorldWeek(world, focusLeagueId, excludedFixtureId));
    };
    worker.postMessage({ id, world, focusLeagueId, excludedFixtureId });
  });
}
