const BASE_MATCH_MINUTES_PER_SECOND = 5;
const WARNING_MINUTE_DURATION_MS = 1250;

export function matchMinuteDurationMs(phase: string, speed: number) {
  if (phase === "warning") return WARNING_MINUTE_DURATION_MS;
  return 1000 / (BASE_MATCH_MINUTES_PER_SECOND * Math.max(1, speed));
}

export function ballTransitionDurationMs(phase: string, speed: number) {
  if (phase === "running" || phase === "warning") return matchMinuteDurationMs(phase, speed);
  return 480;
}

export function matchMinutesPerSecond(speed: number) {
  return BASE_MATCH_MINUTES_PER_SECOND * Math.max(1, speed);
}
