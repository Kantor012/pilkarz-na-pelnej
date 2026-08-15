import { nextRandom, poisson, randomInt } from "./rng";
import type {
  ActionResolution,
  AttrKey,
  ClubProfile,
  CreateMatchInput,
  GameKind,
  InteractiveOpportunity,
  MatchEvent,
  MatchRole,
  MatchSimulationState,
  OpportunityEffect,
  PitchPlayer,
  PitchPoint,
  Position,
} from "./types";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

type OpportunityTemplate = {
  title: string;
  flavor: string;
  prompt: string;
  actionType: string;
  kind: GameKind;
  skill: AttrKey;
  effect: OpportunityEffect;
  failConcedes: boolean;
};

const OPPORTUNITY_LIBRARY: Record<Position, OpportunityTemplate[]> = {
  Bramkarz: [
    { title: "Strzał spod lady", flavor: "Napastnik wyskoczył sam. Ktoś z obrony właśnie udaje, że wiąże but.", prompt: "Przygotuj się na paradę refleksu", actionType: "parada", kind: "reaction", skill: "refleks", effect: "save", failConcedes: true },
    { title: "Sam na sam i samotność", flavor: "Skróć kąt, nie godność.", prompt: "Zapamiętaj sekwencję wyjścia", actionType: "wyjście do piłki", kind: "sequence", skill: "technika", effect: "save", failConcedes: true },
    { title: "Karny po konsultacji z bufetem", flavor: "Strzelec patrzy w róg trochę zbyt demonstracyjnie.", prompt: "Odczytaj kierunek strzału", actionType: "rzut karny", kind: "choice", skill: "refleks", effect: "save", failConcedes: true },
    { title: "Wznowienie z ambicją", flavor: "Jedno podanie może uruchomić kontrę albo dział reklamacji.", prompt: "Wybierz wolny korytarz", actionType: "wznowienie", kind: "choice", skill: "podania", effect: "assist", failConcedes: false },
    { title: "Bomba pod poprzeczkę", flavor: "Piłka leci tam, gdzie rękawice mają najdalej.", prompt: "Zatrzymaj znacznik w strefie parady", actionType: "parada", kind: "timing", skill: "refleks", effect: "save", failConcedes: true },
  ],
  Obrońca: [
    { title: "Wślizg ostatniej faktury", flavor: "Napastnik wychodzi na czystą pozycję.", prompt: "Traf w moment odbioru", actionType: "odbiór", kind: "timing", skill: "odbior", effect: "tackle", failConcedes: true },
    { title: "Piłka między liniami", flavor: "Przechwyć ją, zanim komentator powie „ale przestrzeń”.", prompt: "Zareaguj na podanie", actionType: "przechwyt", kind: "reaction", skill: "refleks", effect: "tackle", failConcedes: false },
    { title: "Wyprowadzenie bez instrukcji", flavor: "Pressing rywala pachnie kłopotami i energetykiem.", prompt: "Powtórz sekwencję wyjścia", actionType: "wyprowadzenie", kind: "sequence", skill: "technika", effect: "progression", failConcedes: true },
    { title: "Główka po rożnym", flavor: "Możesz wybić albo zostać elementem skrótu meczu.", prompt: "Wygraj pojedynek w powietrzu", actionType: "główka", kind: "timing", skill: "sila", effect: "tackle", failConcedes: true },
    { title: "Podanie rozpoczynające kontrę", flavor: "Skrzydłowy ruszył. Sam jest tym zaskoczony.", prompt: "Wybierz linię podania", actionType: "podanie", kind: "choice", skill: "podania", effect: "assist", failConcedes: false },
  ],
  Pomocnik: [
    { title: "Podanie przez urząd skarbowy", flavor: "Wąski korytarz, duża odpowiedzialność.", prompt: "Wybierz właściwą linię", actionType: "podanie prostopadłe", kind: "choice", skill: "podania", effect: "assist", failConcedes: false },
    { title: "Drybling przez korek", flavor: "Dwóch rywali, jedna piłka i zero planu B.", prompt: "Powtórz sekwencję zwodów", actionType: "drybling", kind: "sequence", skill: "drybling", effect: "progression", failConcedes: false },
    { title: "Strzał z drugiej linii", flavor: "Trener krzyczy „nie strzelaj”, czyli wiadomo co robić.", prompt: "Złap idealny moment", actionType: "strzał", kind: "timing", skill: "strzal", effect: "goal", failConcedes: false },
    { title: "Kontrapressing po stracie", flavor: "Piłka odskoczyła rywalowi na długość jednej premii.", prompt: "Zareaguj i odbierz", actionType: "przechwyt", kind: "reaction", skill: "odbior", effect: "tackle", failConcedes: true },
    { title: "Dośrodkowanie na nos", flavor: "Napastnik pokazuje gdzie. Oby sam wiedział.", prompt: "Ustaw siłę dośrodkowania", actionType: "dośrodkowanie", kind: "timing", skill: "technika", effect: "assist", failConcedes: false },
  ],
  Napastnik: [
    { title: "Sam na sam z ratą kredytu", flavor: "Bramkarz skraca kąt, ty skracaj procedurę.", prompt: "Traf w moment strzału", actionType: "strzał", kind: "timing", skill: "strzal", effect: "goal", failConcedes: false },
    { title: "Obrońca kupuje pierwszy zwód", flavor: "Drugi jest w promocji, trzeci bez gwarancji.", prompt: "Powtórz sekwencję dryblingu", actionType: "drybling", kind: "sequence", skill: "drybling", effect: "progression", failConcedes: false },
    { title: "Piłka spada z rachunkiem", flavor: "Masz sekundę na decyzję i całą szatnię do rozliczenia.", prompt: "Zareaguj na dobitkę", actionType: "dobitka", kind: "reaction", skill: "refleks", effect: "goal", failConcedes: false },
    { title: "Kontra trzy na dwa", flavor: "Kolega jest wolny. To wydarzenie historyczne.", prompt: "Wybierz podanie lub strzał", actionType: "decyzja", kind: "choice", skill: "podania", effect: "assist", failConcedes: true },
    { title: "Główka z piątego piętra", flavor: "Dośrodkowanie leci wysoko, obrońca jeszcze wyżej podnosi łokieć.", prompt: "Złap moment wyskoku", actionType: "główka", kind: "timing", skill: "sila", effect: "goal", failConcedes: false },
  ],
};

const FORMATION: Array<{ x: number; y: number; role: string; number: number }> = [
  { x: 7, y: 32, role: "GK", number: 1 },
  { x: 22, y: 10, role: "LB", number: 3 },
  { x: 20, y: 25, role: "CB", number: 4 },
  { x: 20, y: 39, role: "CB", number: 5 },
  { x: 22, y: 54, role: "RB", number: 2 },
  { x: 42, y: 18, role: "CM", number: 6 },
  { x: 40, y: 32, role: "CM", number: 8 },
  { x: 42, y: 46, role: "CM", number: 10 },
  { x: 67, y: 12, role: "LW", number: 11 },
  { x: 73, y: 32, role: "ST", number: 9 },
  { x: 67, y: 52, role: "RW", number: 7 },
];

function controlledIndex(position: Position) {
  if (position === "Bramkarz") return 0;
  if (position === "Obrońca") return 2;
  if (position === "Pomocnik") return 6;
  return 9;
}

function determineRole(input: CreateMatchInput, state: number) {
  const form = (input.energy + input.morale) / 2;
  const score = input.managerTrust * 0.5 + form * 0.25 + 25 + (input.playerOvr - input.teamStrength) * 1.6;
  const roll = nextRandom(state);
  const noisyScore = score + (roll.value - 0.5) * 22;
  const role: MatchRole = noisyScore >= 58 ? "starter" : noisyScore >= 38 ? "bench" : "out";
  return { state: roll.state, role };
}

function roleMinutes(role: MatchRole, position: Position, state: number) {
  if (role === "out") return { state, start: 91, end: 91 };
  if (position === "Bramkarz" && role === "starter") return { state, start: 0, end: 90 };
  if (role === "starter") {
    const end = randomInt(state, 68, 90);
    return { state: end.state, start: 0, end: end.value };
  }
  const start = randomInt(state, 54, 78);
  return { state: start.state, start: start.value, end: 90 };
}

function opportunityLambda(position: Position) {
  return position === "Bramkarz" ? 1.8 : position === "Obrońca" ? 2 : position === "Pomocnik" ? 3 : 3.2;
}

function makeOpportunities(input: CreateMatchInput, role: MatchRole, startMinute: number, endMinute: number, state: number) {
  if (role === "out" || endMinute <= startMinute) return { state, opportunities: [] as InteractiveOpportunity[] };
  const minuteShare = (endMinute - startMinute) / 90;
  const formFactor = clamp(((input.energy + input.morale) / 2) / 72, 0.65, 1.25);
  const countRoll = poisson(state, opportunityLambda(input.position) * minuteShare * formFactor);
  let cursor = countRoll.state;
  const count = Math.min(7, countRoll.value);
  const minutes: number[] = [];
  let guard = 0;
  while (minutes.length < count && guard < 80) {
    const minuteRoll = randomInt(cursor, Math.max(4, startMinute + 3), Math.min(88, endMinute - 1));
    cursor = minuteRoll.state;
    if (!minutes.some((minute) => Math.abs(minute - minuteRoll.value) < 5)) minutes.push(minuteRoll.value);
    guard += 1;
  }
  minutes.sort((a, b) => a - b);
  const library = OPPORTUNITY_LIBRARY[input.position];
  const opportunities = minutes.map((minute, index) => {
    const templateRoll = randomInt(cursor, 0, library.length - 1);
    cursor = templateRoll.state;
    const pressureRoll = nextRandom(cursor);
    cursor = pressureRoll.state;
    const opponentRoll = nextRandom(cursor);
    cursor = opponentRoll.state;
    const template = library[templateRoll.value];
    return {
      id: `opp-${index + 1}-${minute}`,
      minute,
      title: template.title,
      flavor: template.flavor,
      prompt: template.prompt,
      actionType: template.actionType,
      kind: template.kind,
      skill: template.skill,
      pressure: 0.25 + pressureRoll.value * 0.7,
      opponentOvr: input.opponent.strength - 4 + opponentRoll.value * 8,
      successEffect: template.effect,
      failConcedes: template.failConcedes,
      target: { x: input.position === "Bramkarz" || input.position === "Obrońca" ? 16 : 82, y: 12 + opponentRoll.value * 40 },
    } satisfies InteractiveOpportunity;
  });
  return { state: cursor, opportunities };
}

function makePitchPlayers(input: CreateMatchInput, role: MatchRole): PitchPlayer[] {
  const selectedIndex = controlledIndex(input.position);
  const home = FORMATION.map((base, index) => ({ id: `home-${index}`, side: "home" as const, ...base, controlled: role !== "out" && index === selectedIndex, highlighted: false }));
  const away = FORMATION.map((base, index) => ({ id: `away-${index}`, side: "away" as const, x: 100 - base.x, y: 64 - base.y, role: base.role, number: base.number, highlighted: false }));
  return [...home, ...away];
}

function spatialSnapshot(state: MatchSimulationState, minute: number, opportunity?: InteractiveOpportunity | null) {
  const attackDirection = state.possession === "home" ? 1 : -1;
  const phaseOffset = (state.zone - 2) * 7 * attackDirection;
  const players = state.players.map((player, index) => {
    const base = FORMATION[index % 11];
    const sideFlip = player.side === "home" ? 1 : -1;
    const baseX = player.side === "home" ? base.x : 100 - base.x;
    const baseY = player.side === "home" ? base.y : 64 - base.y;
    const wave = Math.sin((minute + index * 1.7 + state.seed % 13) * 0.37);
    const drift = state.possession === player.side ? 4 : -2;
    const x = clamp(baseX + sideFlip * (phaseOffset + drift) + wave * 2.3, 3, 97);
    const y = clamp(baseY + Math.cos((minute + index) * 0.29) * 3.5, 3, 61);
    const controlledSlot = player.side === state.playerSide && index % 11 === controlledIndex(state.playerPosition);
    const controlled = controlledSlot && minute >= state.playerStartMinute && minute <= state.playerEndMinute;
    return { ...player, x, y, controlled, highlighted: Boolean(opportunity && (controlled || (player.side !== state.playerSide && index % 11 === controlledIndex(state.playerPosition)))) };
  });
  const ownerPool = players.filter((player) => player.side === state.possession);
  const owner = ownerPool[(minute + state.zone * 3 + state.seed) % ownerPool.length];
  const target = opportunity?.target ?? { x: clamp(owner.x + attackDirection * 13, 4, 96), y: clamp(owner.y + Math.sin(minute) * 8, 3, 61) };
  return { players, ball: { x: owner.x, y: owner.y, ownerId: owner.id, target } };
}

function event(id: string, minute: number, type: MatchEvent["type"], side: MatchEvent["side"], text: string): MatchEvent {
  return { id, minute, type, side, text };
}

function simulateMinute(state: MatchSimulationState, minute: number) {
  let rngState = state.rngState;
  let possession = state.possession;
  let zone = state.zone;
  let scoreHome = state.scoreHome;
  let scoreAway = state.scoreAway;
  const events = [...state.events];
  const turnover = nextRandom(rngState); rngState = turnover.state;
  if (turnover.value < 0.14) {
    possession = possession === "home" ? "away" : "home";
    zone = 4 - zone;
    if (events.length < 80) events.unshift(event(`turn-${minute}-${rngState}`, minute, "turnover", possession, `${minute}′ Odbiór w środku pola. Piłka zmienia właściciela i plany na wieczór.`));
  } else {
    const direction = nextRandom(rngState); rngState = direction.state;
    zone = clamp(zone + (direction.value < 0.56 ? 1 : -1), 0, 4);
  }
  const attackStrength = possession === "home" ? state.playerClub.strength : state.opponent.strength;
  const defenseStrength = possession === "home" ? state.opponent.strength : state.playerClub.strength;
  const goalRoll = nextRandom(rngState); rngState = goalRoll.state;
  const goalChance = clamp(0.006 + (attackStrength - defenseStrength) * 0.00045 + (zone === 4 ? 0.009 : 0), 0.002, 0.025);
  if (goalRoll.value < goalChance) {
    if (possession === "home") scoreHome += 1; else scoreAway += 1;
    events.unshift(event(`goal-${minute}-${rngState}`, minute, "goal", possession, `${minute}′ GOL! ${possession === "home" ? state.playerClub.name : state.opponent.name} kończy akcję bez pytania cię o zgodę.`));
    possession = possession === "home" ? "away" : "home";
    zone = 2;
  } else if (zone === 4 && goalRoll.value < goalChance + 0.045 && events.length < 80) {
    events.unshift(event(`shot-${minute}-${rngState}`, minute, "shot", possession, `${minute}′ Strzał, ale piłka wybiera bezpieczniejszą przyszłość obok bramki.`));
  }
  const spatial = spatialSnapshot({ ...state, possession, zone }, minute);
  return { ...state, rngState, minute, possession, zone, scoreHome, scoreAway, events: events.slice(0, 80), ...spatial };
}

export function createMatch(input: CreateMatchInput, seed: number): MatchSimulationState {
  const roleResult = determineRole(input, seed);
  const minutes = roleMinutes(roleResult.role, input.position, roleResult.state);
  const generated = makeOpportunities(input, roleResult.role, minutes.start, minutes.end, minutes.state);
  const base: MatchSimulationState = {
    version: 1,
    seed,
    rngState: generated.state,
    id: `match-${seed}`,
    minute: 0,
    scoreHome: 0,
    scoreAway: 0,
    playerSide: "home",
    playerRole: roleResult.role,
    playerStartMinute: minutes.start,
    playerEndMinute: minutes.end,
    playerOvr: input.playerOvr,
    playerPosition: input.position,
    playerAttrs: input.attrs,
    playerEnergy: input.energy,
    playerMorale: input.morale,
    playerClub: input.playerClub,
    opponent: input.opponent,
    phase: "running",
    speed: 1,
    possession: "home",
    zone: 2,
    players: makePitchPlayers(input, roleResult.role),
    ball: { x: 50, y: 50, ownerId: null, target: { x: 50, y: 50 } },
    opportunities: generated.opportunities,
    opportunityIndex: 0,
    currentOpportunity: null,
    resolved: null,
    rating: 6,
    stats: { goals: 0, assists: 0, saves: 0, tackles: 0, won: 0, attempts: 0 },
    events: [event(`kickoff-${seed}`, 0, "kickoff", "neutral", "1′ Sędzia sprawdził zegarek. Działa. Gramy!")],
  };
  return { ...base, ...spatialSnapshot(base, 0) };
}

export function advanceMatch(state: MatchSimulationState, deltaMinutes = 1): MatchSimulationState {
  if (state.phase === "opportunity" || state.phase === "resolved" || state.phase === "finished") return state;
  let next = { ...state };
  const targetMinute = Math.min(90, state.minute + Math.max(1, Math.floor(deltaMinutes)));
  while (next.minute < targetMinute) {
    const upcoming = next.opportunities[next.opportunityIndex];
    const newMinute = next.minute + 1;
    if (upcoming && newMinute >= upcoming.minute) {
      const spatial = spatialSnapshot(next, upcoming.minute, upcoming);
      next = { ...next, minute: upcoming.minute, phase: "opportunity", currentOpportunity: upcoming, ...spatial };
      break;
    }
    next = simulateMinute(next, newMinute);
    if (next.playerRole === "bench" && newMinute === next.playerStartMinute) {
      next = { ...next, events: [event(`sub-on-${next.seed}`, newMinute, "substitution", next.playerSide, `${newMinute}′ Wchodzisz na boisko. Trener powiedział „rób swoje”, więc zakres obowiązków jest jasny.`), ...next.events].slice(0, 80) };
    }
    if (next.playerRole === "starter" && next.playerEndMinute < 90 && newMinute === next.playerEndMinute) {
      next = { ...next, events: [event(`sub-off-${next.seed}`, newMinute, "substitution", next.playerSide, `${newMinute}′ Zmiana. Schodzisz z boiska, ławka udaje, że ma dla ciebie miejsce.`), ...next.events].slice(0, 80) };
    }
    if (upcoming && newMinute >= upcoming.minute - 3) {
      next = { ...next, phase: "warning", currentOpportunity: upcoming, ...spatialSnapshot(next, newMinute, upcoming) };
    } else if (next.phase === "warning") {
      next = { ...next, phase: "running", currentOpportunity: null };
    }
  }
  if (next.minute >= 90 && next.phase !== "opportunity") {
    const finalEvent = event(`fulltime-${next.seed}`, 90, "fulltime", "neutral", `90′ KONIEC! ${next.scoreHome}:${next.scoreAway}. Bufet zamyka okienko.`);
    next = { ...next, minute: 90, phase: "finished", currentOpportunity: null, events: [finalEvent, ...next.events] };
  }
  return next;
}

function probabilityFor(state: MatchSimulationState, opportunity: InteractiveOpportunity, quality: number) {
  const q = clamp(quality, 0, 100) / 100;
  const skill = state.playerAttrs[opportunity.skill];
  const skillEdge = clamp((skill - opportunity.opponentOvr) / 25, -1, 1);
  const teamEdge = clamp((state.playerOvr - state.opponent.strength) / 30, -1, 1);
  const form = clamp(((state.playerEnergy + state.playerMorale) / 2 - 55) / 45, -1, 1);
  const fatigue = clamp((100 - state.playerEnergy) / 100, 0, 1);
  const logit = -3.2 + 6.5 * q + 0.8 * skillEdge + 0.4 * teamEdge + 0.35 * form - 0.55 * fatigue - 0.35 * opportunity.pressure;
  let probability = sigmoid(logit);
  if (quality >= 85) probability = Math.max(0.86, probability);
  if (quality < 35) probability = Math.min(0.22, probability);
  return clamp(probability, 0.01, 0.985);
}

export function opportunityChanceRange(state: MatchSimulationState, opportunity: InteractiveOpportunity) {
  const lower = probabilityFor(state, opportunity, 85) * 100;
  const upper = probabilityFor(state, opportunity, 100) * 100;
  return [Math.max(1, Math.floor(lower / 5) * 5), Math.min(99, Math.ceil(upper / 5) * 5)] as const;
}

function resolutionText(effect: OpportunityEffect, success: boolean, chance: number, roll: number) {
  if (!success) return `Akcja nie wyszła. Model dawał ${Math.round(chance * 100)}%, los zatrzymał się na ${Math.round(roll * 100)}%. Futbol właśnie wystawił fakturę za pewność siebie.`;
  if (effect === "goal") return "GOL! Minigra zrobiła swoje, a piłka wyjątkowo uszanowała matematykę.";
  if (effect === "assist") return "Podanie otworzyło obronę. Kolega trafił, choć przez chwilę wyglądał jakby nie chciał.";
  if (effect === "save") return "OBRONA! Rękawice, refleks i odrobina szczęścia podpisały wspólny protokół.";
  if (effect === "tackle") return "CZYSTY ODBIÓR. Sędzia nie gwiżdże, więc oficjalnie wszystko było elegancko.";
  return "Akcja przesuwa zespół pod bramkę. Trybuny przez moment wierzą w plan taktyczny.";
}

export function submitAction(state: MatchSimulationState, opportunityId: string, quality: number): MatchSimulationState {
  if (state.phase !== "opportunity" || !state.currentOpportunity || state.currentOpportunity.id !== opportunityId) return state;
  const opportunity = state.currentOpportunity;
  const chance = probabilityFor(state, opportunity, quality);
  const random = nextRandom(state.rngState);
  const success = random.value < chance;
  let scoreHome = state.scoreHome;
  let scoreAway = state.scoreAway;
  const stats = { ...state.stats, attempts: state.stats.attempts + 1, won: state.stats.won + (quality >= 60 ? 1 : 0) };
  if (success) {
    if (opportunity.successEffect === "goal" || opportunity.successEffect === "assist") {
      if (state.playerSide === "home") scoreHome += 1; else scoreAway += 1;
    }
    if (opportunity.successEffect === "goal") stats.goals += 1;
    if (opportunity.successEffect === "assist") stats.assists += 1;
    if (opportunity.successEffect === "save") stats.saves += 1;
    if (opportunity.successEffect === "tackle") stats.tackles += 1;
  } else if (opportunity.failConcedes) {
    if (state.playerSide === "home") scoreAway += 1; else scoreHome += 1;
  }
  const factors = [
    `jakość ${Math.round(quality)}/100`,
    `${opportunity.skill} ${Math.round(state.playerAttrs[opportunity.skill])}`,
    `OVR ${state.playerOvr.toFixed(1)} vs ${state.opponent.strength.toFixed(1)}`,
    `energia ${Math.round(state.playerEnergy)}%`,
  ];
  const resolution: ActionResolution = { opportunityId, quality: Math.round(quality), chance: Math.round(chance * 1000) / 10, roll: Math.round(random.value * 1000) / 10, success, text: resolutionText(opportunity.successEffect, success, chance, random.value), factors };
  const side = success ? state.playerSide : opportunity.failConcedes ? (state.playerSide === "home" ? "away" : "home") : "neutral";
  const resultEvent = event(`interactive-${opportunity.id}`, opportunity.minute, success ? opportunity.successEffect === "goal" || opportunity.successEffect === "assist" ? "goal" : opportunity.successEffect === "save" ? "save" : "tackle" : opportunity.failConcedes ? "goal" : "turnover", side, `${opportunity.minute}′ ${resolution.text}`);
  return {
    ...state,
    rngState: random.state,
    scoreHome,
    scoreAway,
    stats,
    rating: clamp(state.rating + (quality - 50) / 100 + (success ? 0.18 : -0.12), 1, 10),
    phase: "resolved",
    resolved: resolution,
    events: [resultEvent, ...state.events].slice(0, 80),
  };
}

export function continueAfterAction(state: MatchSimulationState): MatchSimulationState {
  if (state.phase !== "resolved") return state;
  return { ...state, phase: "running", opportunityIndex: state.opportunityIndex + 1, currentOpportunity: null, resolved: null };
}

export function setMatchSpeed(state: MatchSimulationState, speed: 1 | 2 | 4) {
  return { ...state, speed };
}

export function roleLabel(role: MatchRole) {
  return role === "starter" ? "PIERWSZY SKŁAD" : role === "bench" ? "ŁAWKA • CZEKAJ NA ZMIANĘ" : "POZA KADRĄ MECZOWĄ";
}

export function clubFromLegacy(name: string, strength: number, color = "#f3aa21"): ClubProfile {
  return { id: `legacy-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, country: "PL", tier: 3, name, short: name.split(/\s+/).map((word) => word[0]).join("").slice(0, 3).toUpperCase(), primary: color, secondary: "#0c1722", strength, reputation: strength, style: "counter", facilities: 0.95 };
}

export function selectedPlayerPoint(state: MatchSimulationState): PitchPoint {
  const controlled = state.players.find((player) => player.controlled);
  return controlled ? { x: controlled.x, y: controlled.y } : { x: 50, y: 50 };
}
