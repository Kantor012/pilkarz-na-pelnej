import { hashSeed, nextRandom } from "./rng";
import type { AttrKey, Attributes, Position } from "./types";

export type DevelopmentIntensity = "lekki" | "normalny" | "mocny";
export type DevelopmentSupportId = "club" | "analysis" | "personal" | "elite";
export type TrainingResponse = "breakthrough" | "adaptation" | "plateau" | "overload";

export interface TrainingDefinition { id: string; attrs: Partial<Attributes>; energy: number }
export interface MicrocyclePlan {
  main: string | null;
  supplementary: string | null;
  /** Zachowane dla zgodności ze starszymi zapisami. Regenerację wybiera teraz pakiet wsparcia. */
  recovery: string | null;
  intensity: DevelopmentIntensity;
  support: DevelopmentSupportId;
}
export interface DevelopmentReport {
  response: TrainingResponse;
  responseLabel: string;
  summary: string;
  attributeGains: Partial<Attributes>;
  bankedProgress: number;
  ovrGain: number;
  energyDelta: number;
  moneyCost: number;
  injuryRisk: number;
}
export interface DevelopmentState {
  plan: MicrocyclePlan;
  recentSessions: string[];
  traits: string[];
  weeklyLoad: number;
  totalSessions: number;
  adaptation: Partial<Record<AttrKey, number>>;
  strain: number;
  weekIndex: number;
  lastReport: DevelopmentReport | null;
}

export const DEVELOPMENT_SUPPORT: Record<DevelopmentSupportId, { label: string; copy: string; baseCost: number; salaryShare: number; recovery: number; learning: number; stability: number }> = {
  club: { label: "Zaplecze klubowe", copy: "W cenie kontraktu. Fizjo ma kolejkę, ale zna twoje kolano.", baseCost: 0, salaryShare: 0, recovery: 5, learning: 1, stability: 0 },
  analysis: { label: "Analiza indywidualna", copy: "Nagrania, dane i mniej zgadywania. Podnosi szansę trafionej adaptacji.", baseCost: 200, salaryShare: .15, recovery: 7, learning: 1.07, stability: .04 },
  personal: { label: "Trener + fizjoterapeuta", copy: "Plan pod ciebie, nie pod 24 chłopa i pachołek bez powietrza.", baseCost: 750, salaryShare: .45, recovery: 10, learning: 1.14, stability: .09 },
  elite: { label: "Sztab premium", copy: "Diagnostyka, odnowa i człowiek, który zabiera telefon przed snem.", baseCost: 1800, salaryShare: .95, recovery: 14, learning: 1.22, stability: .14 },
};

export function developmentSupportCost(id: DevelopmentSupportId, weeklySalary: number) {
  const support = DEVELOPMENT_SUPPORT[id];
  if (id === "club") return 0;
  return Math.ceil(Math.max(support.baseCost, Math.max(0, weeklySalary) * support.salaryShare) / 50) * 50;
}

const INTENSITY = {
  lekki: { growth: .72, cost: .72, load: 7 },
  normalny: { growth: 1, cost: 1, load: 15 },
  mocny: { growth: 1.28, cost: 1.32, load: 27 },
} as const;
const TRAITS: Array<{ id: string; session: string; count: number }> = [
  { id: "Klej w bucie", session: "ball", count: 7 }, { id: "Łowca pola karnego", session: "finish", count: 7 },
  { id: "Kieszonkowy reżyser", session: "passing", count: 7 }, { id: "Czyściciel", session: "defense", count: 7 },
  { id: "Pierwszy krok", session: "speed", count: 7 }, { id: "Żelazne płuca", session: "gym", count: 7 },
];
const RESPONSE_LABELS: Record<TrainingResponse, string> = {
  breakthrough: "PRZEŁOM", adaptation: "ADAPTACJA", plateau: "ZASTÓJ", overload: "PRZECIĄŻENIE",
};

export const emptyDevelopmentState = (): DevelopmentState => ({
  plan: { main: null, supplementary: null, recovery: null, intensity: "normalny", support: "club" },
  recentSessions: [], traits: [], weeklyLoad: 0, totalSessions: 0, adaptation: {}, strain: 0, weekIndex: 0, lastReport: null,
});

export function normalizeDevelopmentState(state?: Partial<DevelopmentState> | null): DevelopmentState {
  const empty = emptyDevelopmentState();
  return {
    ...empty,
    ...state,
    plan: { ...empty.plan, ...(state?.plan ?? {}), support: state?.plan?.support ?? "club", recovery: null },
    recentSessions: state?.recentSessions ?? [],
    traits: state?.traits ?? [],
    adaptation: state?.adaptation ?? {},
    lastReport: state?.lastReport ?? null,
  };
}

export function selectMicrocycleSession(state: DevelopmentState, trainingId: string, recovery = false) {
  const current = normalizeDevelopmentState(state);
  const plan = { ...current.plan };
  if (recovery) return current;
  if (plan.main === trainingId) plan.main = null;
  else if (plan.supplementary === trainingId) plan.supplementary = null;
  else if (!plan.main) plan.main = trainingId;
  else plan.supplementary = trainingId;
  return { ...current, plan };
}

export function setDevelopmentIntensity(state: DevelopmentState, intensity: DevelopmentIntensity) {
  const current = normalizeDevelopmentState(state);
  return { ...current, plan: { ...current.plan, intensity } };
}

export function setDevelopmentSupport(state: DevelopmentState, support: DevelopmentSupportId) {
  const current = normalizeDevelopmentState(state);
  return { ...current, plan: { ...current.plan, support } };
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
  return Math.max(.36, 1 - repeats * .12);
}

export function forecastSession(state: DevelopmentState, training: TrainingDefinition, age: number, positionWeight: Partial<Record<AttrKey, number>>, slot: "main" | "supplementary" | "recovery") {
  const current = normalizeDevelopmentState(state);
  const intensity = INTENSITY[current.plan.intensity];
  const support = DEVELOPMENT_SUPPORT[current.plan.support];
  const slotFactor = slot === "main" ? 1 : slot === "supplementary" ? .64 : 0;
  const repetition = repetitionMultiplier(current.recentSessions, training.id);
  const growth = intensity.growth * slotFactor * ageMultiplier(age) * repetition * support.learning;
  const expectedOvr = Object.entries(training.attrs).reduce((sum, [key, gain]) => sum + (gain ?? 0) * (positionWeight[key as AttrKey] ?? 0) * growth, 0);
  const uncertainty = .42 + Math.min(.18, current.strain / 260);
  const low = Math.max(0, expectedOvr * (1 - uncertainty));
  const high = expectedOvr * (1.34 - support.stability);
  return {
    growth,
    ovrGain: expectedOvr,
    range: [low, high] as [number, number],
    energy: Math.round(training.energy * intensity.cost * (slot === "supplementary" ? .72 : 1)),
    repetition,
    breakthroughChance: Math.round(Math.max(4, Math.min(24, 9 + support.stability * 55 + (1 - repetition) * 8 - current.strain * .08))),
  };
}

export function previewMicrocycle(input: { state: DevelopmentState; trainings: TrainingDefinition[]; age: number; positionWeight: Partial<Record<AttrKey, number>>; weeklySalary?: number }) {
  const state = normalizeDevelopmentState(input.state);
  const selected = (["main", "supplementary"] as const)
    .map((slot) => ({ slot, id: state.plan[slot] }))
    .filter((item): item is { slot: "main" | "supplementary"; id: string } => Boolean(item.id));
  const forecasts = selected.flatMap(({ slot, id }) => {
    const training = input.trainings.find((candidate) => candidate.id === id);
    return training ? [forecastSession(state, training, input.age, input.positionWeight, slot)] : [];
  });
  const support = DEVELOPMENT_SUPPORT[state.plan.support];
  const trainingEnergy = forecasts.reduce((sum, item) => sum + Math.min(0, item.energy), 0);
  // Trening nie jest perpetuum mobile: po każdej jednostce tydzień zawsze kończy się deficytem energii.
  const energyDelta = forecasts.length ? Math.min(-2, trainingEnergy + support.recovery) : 0;
  const range = forecasts.reduce(([low, high], item) => [low + item.range[0], high + item.range[1]], [0, 0]);
  const load = Math.min(100, Math.abs(trainingEnergy) * 2.1 + INTENSITY[state.plan.intensity].load + state.strain * .25 - support.recovery * .7);
  const injuryRisk = Math.round(Math.max(1, Math.min(32, 2 + load * .16 + state.strain * .11 - support.stability * 35)));
  return { energyDelta, range: range as [number, number], load: Math.round(load), injuryRisk, moneyCost: developmentSupportCost(state.plan.support, input.weeklySalary ?? 0), sessions: forecasts.length };
}

export function settleWeeklyRecovery(input: { state: DevelopmentState; trainingDone: boolean; appeared: boolean; role: "starter" | "bench" | "out"; funds: number; weeklySalary?: number }) {
  const state = normalizeDevelopmentState(input.state);
  const requestedCost = developmentSupportCost(state.plan.support, input.weeklySalary ?? 0);
  const supportId: DevelopmentSupportId = !input.trainingDone && input.funds >= requestedCost ? state.plan.support : "club";
  const support = DEVELOPMENT_SUPPORT[supportId];
  // Zaplecze kupione w mikrocyklu zostało już rozliczone. Bez treningu działa jako osobny pakiet odnowy.
  const passiveRecovery = input.trainingDone ? 0 : Math.round(support.recovery * .65);
  const activityDelta = input.appeared ? (input.role === "starter" ? -16 : -9) : 10;
  const energyDelta = input.appeared ? Math.min(0, activityDelta + passiveRecovery) : Math.min(20, activityDelta + passiveRecovery);
  return {
    energyDelta,
    moneyCost: input.trainingDone ? 0 : developmentSupportCost(supportId, input.weeklySalary ?? 0),
    supportId,
    label: input.appeared ? (energyDelta < 0 ? "Koszt wysiłku meczowego" : "Mecz zbilansowany odnową") : "Tydzień odpoczynku i odbudowy",
  };
}

function responseFor(state: DevelopmentState, seed: number, preview: ReturnType<typeof previewMicrocycle>) {
  const support = DEVELOPMENT_SUPPORT[state.plan.support];
  const first = nextRandom(hashSeed(`${seed}-${state.weekIndex}-${state.totalSessions}-${state.plan.main}-${state.plan.supplementary}-${state.plan.support}`));
  const breakthrough = Math.max(.04, .09 + support.stability * .55 - state.strain * .0008);
  const overload = Math.max(.02, preview.injuryRisk / 220 - support.stability * .08);
  const plateau = Math.min(.34, .11 + state.strain * .0018 + (state.recentSessions.slice(-5).filter((id) => id === state.plan.main).length * .035));
  const roll = first.value;
  const response: TrainingResponse = roll < overload ? "overload" : roll < overload + plateau ? "plateau" : roll > 1 - breakthrough ? "breakthrough" : "adaptation";
  const second = nextRandom(first.state);
  const multiplier = response === "breakthrough" ? 1.36 + second.value * .22 : response === "adaptation" ? .76 + second.value * .34 : response === "plateau" ? .16 + second.value * .18 : .05 + second.value * .12;
  return { response, multiplier };
}

export function applyMicrocycle(input: { state: DevelopmentState; trainings: TrainingDefinition[]; attrs: Attributes; age: number; potential: number; positionWeight: Partial<Record<AttrKey, number>>; professionalism: number; facilities: number; seed?: number; funds?: number; weeklySalary?: number }) {
  const state = normalizeDevelopmentState(input.state);
  const requestedCost = developmentSupportCost(state.plan.support, input.weeklySalary ?? 0);
  const affordableSupport = input.funds === undefined || input.funds >= requestedCost ? state.plan.support : "club";
  const effectiveState = affordableSupport === state.plan.support ? state : { ...state, plan: { ...state.plan, support: affordableSupport } };
  const preview = previewMicrocycle({ state: effectiveState, trainings: input.trainings, age: input.age, positionWeight: input.positionWeight, weeklySalary: input.weeklySalary });
  const selected = (["main", "supplementary"] as const)
    .map((slot) => ({ slot, id: effectiveState.plan[slot] }))
    .filter((item): item is { slot: "main" | "supplementary"; id: string } => Boolean(item.id));
  const attrs = { ...input.attrs };
  const adaptation = { ...effectiveState.adaptation };
  const completed: string[] = [];
  const attributeGains: Partial<Attributes> = {};
  const response = responseFor(effectiveState, input.seed ?? 1, preview);
  const environment = (.72 + input.professionalism / 250) * input.facilities;
  let bankedProgress = 0;
  for (const selectedSession of selected) {
    const training = input.trainings.find((candidate) => candidate.id === selectedSession.id);
    if (!training) continue;
    const forecast = forecastSession(effectiveState, training, input.age, input.positionWeight, selectedSession.slot);
    Object.entries(training.attrs).forEach(([key, gain]) => {
      const attr = key as AttrKey;
      const potentialRoom = Math.max(.08, Math.min(1, (input.potential - attrs[attr]) / 16));
      const earned = (gain ?? 0) * forecast.growth * environment * response.multiplier * (.55 + potentialRoom * .45);
      const bank = (adaptation[attr] ?? 0) + earned;
      const wholePoints = Math.min(Math.max(0, Math.floor(bank)), Math.max(0, Math.floor(input.potential - attrs[attr])));
      adaptation[attr] = bank - wholePoints;
      if (wholePoints > 0) {
        attrs[attr] = Math.min(input.potential, attrs[attr] + wholePoints);
        attributeGains[attr] = (attributeGains[attr] ?? 0) + wholePoints;
      }
      bankedProgress += earned;
    });
    completed.push(training.id);
  }
  const recentSessions = [...effectiveState.recentSessions, ...completed].slice(-24);
  const traits = [...effectiveState.traits];
  for (const trait of TRAITS) if (!traits.includes(trait.id) && recentSessions.filter((id) => id === trait.session).length >= trait.count) traits.push(trait.id);
  const ovrGain = (Object.keys(attributeGains) as AttrKey[]).reduce((sum, key) => sum + (attributeGains[key] ?? 0) * (input.positionWeight[key] ?? 0), 0);
  const nextStrain = Math.max(0, Math.min(100, effectiveState.strain * .56 + preview.load * .48 - DEVELOPMENT_SUPPORT[affordableSupport].recovery * .65));
  const summaries: Record<TrainingResponse, string> = {
    breakthrough: "Organizm odpowiedział ponad plan. Sztab udaje, że dokładnie to przewidział.",
    adaptation: "Solidna robota. Część efektu trafiła do banku adaptacji i zaprocentuje później.",
    plateau: "Bodziec był zbyt znajomy. Jest postęp procesu, ale tablica wyników jeszcze go nie pokazuje.",
    overload: "Plan wszedł za mocno. Rozwój minimalny, zmęczenie całkiem profesjonalne.",
  };
  const report: DevelopmentReport = {
    response: response.response, responseLabel: RESPONSE_LABELS[response.response], summary: summaries[response.response], attributeGains,
    bankedProgress, ovrGain, energyDelta: preview.energyDelta, moneyCost: developmentSupportCost(affordableSupport, input.weeklySalary ?? 0), injuryRisk: preview.injuryRisk,
  };
  return {
    attrs, energy: preview.energyDelta, ovrGain, moneyCost: report.moneyCost, report,
    state: {
      plan: { main: null, supplementary: null, recovery: null, intensity: effectiveState.plan.intensity, support: effectiveState.plan.support },
      recentSessions, traits, weeklyLoad: preview.load, totalSessions: effectiveState.totalSessions + completed.length,
      adaptation, strain: nextStrain, weekIndex: effectiveState.weekIndex + 1, lastReport: report,
    } satisfies DevelopmentState,
  };
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
