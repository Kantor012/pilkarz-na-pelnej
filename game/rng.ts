export function normalizeSeed(seed: number) {
  const normalized = seed >>> 0;
  return normalized || 0x6d2b79f5;
}

export function nextRandom(state: number) {
  let value = normalizeSeed(state);
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  const nextState = value >>> 0;
  return { state: nextState, value: nextState / 4294967296 };
}

export function randomInt(state: number, min: number, max: number) {
  const next = nextRandom(state);
  return { state: next.state, value: Math.floor(next.value * (max - min + 1)) + min };
}

export function hashSeed(value: string | number) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return normalizeSeed(hash);
}

export function poisson(state: number, lambda: number) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  let cursor = state;
  while (product > limit && count < 16) {
    const next = nextRandom(cursor);
    cursor = next.state;
    product *= Math.max(0.000001, next.value);
    count += 1;
  }
  return { state: cursor, value: Math.max(0, count - 1) };
}
