import type { AttrKey, Attributes, Position } from "./types";

export type DevelopmentIntensity = "lekki" | "normalny" | "mocny";
export interface TrainingDefinition { id: string; attrs: Partial<Attributes>; energy: number }
export interface MicrocyclePlan { main: string | null; supplementary: string | null; recovery: string | null; intensity: DevelopmentIntensity }
export interface DevelopmentState {
  plan: MicrocyclePlan;
  recentSessions: string[];
  traits: string[];
  weeklyLoad: number;
  totalSessions: number;
}

const INTENSITY = { lekki: { growth: .72, cost: .62 }, normalny: { growth: 1, cost: 1 }, mocny: { growth: 1.34, cost: 1.4 } } as const;
const TRAITS: Array<{ id: string; session: string; count: number }> = [
  { id: "Klej w bucie", session: "ball", count: 7 }, { id: "Łowca pola karnego", session: "finish", count: 7 },
  { id: "Kieszonkowy reżyser", session: "passing", count: 7 }, { id: "Czyściciel", session: "defense", count: 7 },
  { id: "Pierwszy krok", session: "speed", count: 7 }, { id: "Żelazne płuca", session: "gym", count: 7 },
];

export const emptyDevelopmentState = (): DevelopmentState => ({ plan: { main: null, supplementary: null, recovery: null, intensity: "normalny" }, recentSessions: [], traits: [], weeklyLoad: 0, totalSessions: 0 });

export function selectMicrocycleSession(state: DevelopmentState, trainingId: string, recovery = false) {
  const plan = { ...state.plan };
  if (recovery) plan.recovery = plan.recovery === trainingId ? null : trainingId;
  else if (plan.main === trainingId) plan.main = null;
  else if (plan.supplementary === trainingId) plan.supplementary = null;
  else if (!plan.main) plan.main = trainingId;
  else plan.supplementary = trainingId;
  return { ...state, plan };
}

export function setDevelopmentIntensity(state: DevelopmentState, intensity: DevelopmentIntensity) {
  return { ...state, plan: { ...state.plan, intensity } };
}

function ageMultiplier(age: number) {
  if (age <= 18) return 1.22;
  if (age <= 21) return 1.12;
  if (age <= 25) return 1;
  if (age <= 29) return .82;
  return .62;
}

function repetitionMultiplier(recent: string[], id: string) {
  const repeats = recent.slice(-8).filter((session) => session === id).length;
  return Math.max(.42, 1 - repeats * .12);
}

export function forecastSession(state: DevelopmentState, training: TrainingDefinition, age: number, positionWeight: Partial<Record<AttrKey, number>>, slot: "main" | "supplementary" | "recovery") {
  const intensity = INTENSITY[state.plan.intensity];
  const slotFactor = slot === "main" ? 1 : slot === "supplementary" ? .62 : .48;
  const repetition = repetitionMultiplier(state.recentSessions, training.id);
  const growth = intensity.growth * slotFactor * ageMultiplier(age) * repetition;
  const ovrGain = Object.entries(training.attrs).reduce((sum, [key, gain]) => sum + (gain ?? 0) * (positionWeight[key as AttrKey] ?? 0) * growth, 0);
  return { growth, ovrGain, energy: Math.round(training.energy * intensity.cost * (slot === "supplementary" ? .7 : slot === "recovery" ? .8 : 1)), repetition };
}

export function applyMicrocycle(input: { state: DevelopmentState; trainings: TrainingDefinition[]; attrs: Attributes; age: number; potential: number; positionWeight: Partial<Record<AttrKey, number>>; professionalism: number; facilities: number }) {
  const selected = (["main", "supplementary", "recovery"] as const).map((slot) => ({ slot, id: input.state.plan[slot] })).filter((item): item is { slot: "main" | "supplementary" | "recovery"; id: string } => Boolean(item.id));
  const attrs = { ...input.attrs };
  let energy = 0;
  let ovrGain = 0;
  const completed: string[] = [];
  for (const selectedSession of selected) {
    const training = input.trainings.find((candidate) => candidate.id === selectedSession.id);
    if (!training) continue;
    const forecast = forecastSession(input.state, training, input.age, input.positionWeight, selectedSession.slot);
    const environment = (.72 + input.professionalism / 250) * input.facilities;
    Object.entries(training.attrs).forEach(([key, gain]) => {
      const attr = key as AttrKey;
      attrs[attr] = Math.min(input.potential, attrs[attr] + (gain ?? 0) * forecast.growth * environment);
    });
    energy += forecast.energy;
    ovrGain += forecast.ovrGain * environment;
    completed.push(training.id);
  }
  const recentSessions = [...input.state.recentSessions, ...completed].slice(-24);
  const traits = [...input.state.traits];
  for (const trait of TRAITS) if (!traits.includes(trait.id) && recentSessions.filter((id) => id === trait.session).length >= trait.count) traits.push(trait.id);
  const weeklyLoad = Math.min(100, Math.abs(Math.min(0, energy)) * 2.4 + (input.state.plan.intensity === "mocny" ? 18 : input.state.plan.intensity === "normalny" ? 8 : 0));
  return { attrs, energy, ovrGain, state: { plan: { main: null, supplementary: null, recovery: null, intensity: input.state.plan.intensity }, recentSessions, traits, weeklyLoad, totalSessions: input.state.totalSessions + completed.length } satisfies DevelopmentState };
}

export function applySeasonAging(attrs: Attributes, position: Position, age: number, potential: number) {
  const next = { ...attrs };
  if (age <= 23) {
    const naturalGrowth = Math.min(.45, (potential - Math.max(...Object.values(attrs))) / 60);
    (Object.keys(next) as AttrKey[]).forEach((key) => { next[key] = Math.min(potential, next[key] + Math.max(0, naturalGrowth)); });
  }
  if (age >= 31) {
    const decline = .18 + (age - 31) * .12;
    next.szybkosc = Math.max(20, next.szybkosc - decline * 1.35);
    next.kondycja = Math.max(20, next.kondycja - decline);
    next.sila = Math.max(20, next.sila - decline * .45);
    if (position === "Bramkarz") next.refleks = Math.max(25, next.refleks - decline * .35);
  }
  return next;
}
