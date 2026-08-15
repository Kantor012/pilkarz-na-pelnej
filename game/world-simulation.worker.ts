/// <reference lib="webworker" />

import { advanceWorldWeek } from "./world";
import type { WorldState } from "./types";

type Request = { id: string; world: WorldState; focusLeagueId: string; excludedFixtureId?: string };

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, world, focusLeagueId, excludedFixtureId } = event.data;
  try {
    self.postMessage({ id, world: advanceWorldWeek(world, focusLeagueId, excludedFixtureId) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "Nieznany błąd symulacji świata" });
  }
};
