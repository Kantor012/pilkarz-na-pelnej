import { hashSeed, nextRandom, randomInt } from "./rng";
import type { Position, WorldState } from "./types";

export interface ContractState { clubId: string; startSeason: number; endSeason: number; weeklySalaryEur: number; appearanceBonusEur: number; goalBonusEur: number; releaseClauseEur: number; promisedRole: "prospekt" | "rotacja" | "pierwszy skład" | "gwiazda"; loanFromClubId?: string }
export interface TransferOffer { id: string; clubId: string; salaryEur: number; signingBonusEur: number; length: number; promisedRole: ContractState["promisedRole"]; interest: number; expiresWeek: number; kind: "transfer" | "loan"; negotiationRound: number }
export interface CareerRelations { coach: number; teammates: number; fans: number; media: number; agent: number }
export interface FinanceEntry { id: string; season: number; week: number; amountEur: number; label: string }
export interface CareerObjective { id: "appearances" | "goals" | "ratings"; label: string; target: number; progress: number }
export interface WeeklyDecisionOption { id: string; label: string; copy: string; costEur: number; reputation: number; relations: Partial<CareerRelations> }
export interface WeeklyDecision { id: string; title: string; copy: string; options: [WeeklyDecisionOption, WeeklyDecisionOption] }
export interface MarketState {
  contract: ContractState;
  agent: { name: string; commission: number; skill: number };
  reputation: number;
  relations: CareerRelations;
  offers: TransferOffer[];
  sponsors: Array<{ name: string; weeklyEur: number; reputationRequired: number }>;
  ledger: FinanceEntry[];
  objectives?: CareerObjective[];
  weeklyDecision?: WeeklyDecision | null;
}

const AGENTS = ["Janusz Klauzula", "Marek Prowizja", "Oskar Telefon", "Ireneusz Fax", "Artur Konkret"];
const SPONSORS = ["Kebab U Prezesa", "Izotonik Bez Smaku", "Korki Na Raty", "Betonex Premium"];
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function createMarketState(clubId: string, season: number, playerOvr: number, seed: number): MarketState {
  let state = hashSeed(`${seed}-${clubId}-market`);
  const agent = randomInt(state, 0, AGENTS.length - 1); state = agent.state;
  const skill = randomInt(state, 42, 82);
  const salary = Math.round(Math.max(80, Math.pow(playerOvr / 10, 2.2) * 22));
  return {
    contract: { clubId, startSeason: season, endSeason: season + 2, weeklySalaryEur: salary, appearanceBonusEur: Math.round(salary * .28), goalBonusEur: Math.round(salary * .45), releaseClauseEur: salary * 520, promisedRole: playerOvr >= 63 ? "pierwszy skład" : playerOvr >= 50 ? "rotacja" : "prospekt" },
    agent: { name: AGENTS[agent.value], commission: 6 + Math.round(skill.value / 18), skill: skill.value }, reputation: Math.round(playerOvr * .65),
    relations: { coach: 55, teammates: 55, fans: 45, media: 35, agent: 60 }, offers: [], sponsors: [], ledger: [],
    objectives: [{ id: "appearances", label: "Występy", target: 18, progress: 0 }, { id: "goals", label: "Gole", target: 6, progress: 0 }, { id: "ratings", label: "Oceny 7+", target: 8, progress: 0 }], weeklyDecision: null,
  };
}

export function generateTransferOffers(world: WorldState, market: MarketState, input: { season: number; week: number; age: number; ovr: number; potential: number; form: number; position: Position; currentClubId: string }, seed: number) {
  if (![1, 15, 16, 30].includes(input.week)) return { ...market, offers: market.offers.filter((offer) => offer.expiresWeek >= input.week) };
  let state = hashSeed(`${seed}-${input.season}-${input.week}-offers`);
  const reputationPower = market.reputation + input.form * .2 + Math.max(0, input.potential - input.ovr) * .25 - Math.max(0, input.age - 29) * 2;
  const candidates = Object.values(world.clubs).filter((club) => club.id !== input.currentClubId && Math.abs(club.strength - input.ovr) <= 13 && club.reputation <= reputationPower + 28);
  const countRoll = randomInt(state, 0, Math.min(3, candidates.length)); state = countRoll.state;
  const offers: TransferOffer[] = [];
  const pool = [...candidates];
  for (let index = 0; index < countRoll.value; index += 1) {
    const pick = randomInt(state, 0, pool.length - 1); state = pick.state;
    const club = pool.splice(pick.value, 1)[0];
    const wageRoll = nextRandom(state); state = wageRoll.state;
    const salaryEur = Math.round(Math.max(market.contract.weeklySalaryEur * 1.04, Math.pow(club.strength / 10, 2.2) * (19 + wageRoll.value * 8)));
    const role: ContractState["promisedRole"] = input.ovr >= club.strength + 5 ? "gwiazda" : input.ovr >= club.strength ? "pierwszy skład" : input.ovr >= club.strength - 5 ? "rotacja" : "prospekt";
    offers.push({ id: `${input.season}-${input.week}-${club.id}`, clubId: club.id, salaryEur, signingBonusEur: Math.round(salaryEur * (5 + market.agent.skill / 20)), length: 2 + Math.floor(wageRoll.value * 3), promisedRole: role, interest: Math.round(clamp(55 + (input.ovr - club.strength) * 2 + wageRoll.value * 22)), expiresWeek: input.week === 30 ? 1 : Math.min(30, input.week + 2), kind: index % 3 === 2 ? "loan" : "transfer", negotiationRound: 0 });
  }
  return { ...market, offers };
}

export function negotiateOffer(market: MarketState, offerId: string) {
  return { ...market, offers: market.offers.map((offer) => {
    const round = offer.negotiationRound ?? 0;
    return offer.id !== offerId || round >= 2 ? offer : { ...offer, salaryEur: Math.round(offer.salaryEur * (1 + market.agent.skill / 650)), signingBonusEur: Math.round(offer.signingBonusEur * 1.08), interest: Math.max(1, offer.interest - 8), negotiationRound: round + 1 };
  }) };
}

export function acceptTransfer(market: MarketState, offer: TransferOffer, season: number, week: number) {
  const commission = Math.round(offer.signingBonusEur * market.agent.commission / 100);
  return { ...market, contract: { clubId: offer.clubId, startSeason: season, endSeason: season + (offer.kind === "loan" ? 1 : offer.length), weeklySalaryEur: offer.salaryEur, appearanceBonusEur: Math.round(offer.salaryEur * .3), goalBonusEur: Math.round(offer.salaryEur * .5), releaseClauseEur: offer.salaryEur * 650, promisedRole: offer.promisedRole, loanFromClubId: offer.kind === "loan" ? market.contract.clubId : undefined }, offers: [], relations: { ...market.relations, coach: 50, teammates: 48, fans: 45, agent: clamp(market.relations.agent + 4) }, ledger: [{ id: `sign-${offer.id}`, season, week, amountEur: offer.signingBonusEur - commission, label: `Premia za podpis (po prowizji ${commission} €)` }, ...market.ledger].slice(0, 100) };
}

export function resolveContractSeason(market: MarketState, season: number) {
  if (market.contract.loanFromClubId && season >= market.contract.endSeason) {
    const parentClubId = market.contract.loanFromClubId;
    const weeklySalaryEur = Math.max(80, Math.round(market.contract.weeklySalaryEur * .94));
    return {
      clubId: parentClubId,
      market: {
        ...market,
        contract: { ...market.contract, clubId: parentClubId, startSeason: season, endSeason: season + 2, weeklySalaryEur, loanFromClubId: undefined },
        offers: [],
        relations: { ...market.relations, coach: 48, teammates: 50, fans: 46 },
        ledger: [{ id: `loan-return-${season}`, season, week: 1, amountEur: 0, label: "Powrót z wypożyczenia do klubu macierzystego" }, ...market.ledger].slice(0, 100),
      },
    };
  }
  if (season >= market.contract.endSeason) {
    const weeklySalaryEur = Math.round(market.contract.weeklySalaryEur * 1.05);
    return {
      clubId: market.contract.clubId,
      market: {
        ...market,
        contract: { ...market.contract, startSeason: season, endSeason: season + 1, weeklySalaryEur, releaseClauseEur: Math.round(market.contract.releaseClauseEur * 1.08) },
        ledger: [{ id: `extension-${season}`, season, week: 1, amountEur: 0, label: "Automatyczne przedłużenie po spełnieniu celu minutowego" }, ...market.ledger].slice(0, 100),
      },
    };
  }
  return { clubId: market.contract.clubId, market };
}

export function settleCareerWeek(market: MarketState, input: { season: number; week: number; appeared: boolean; goals: number; rating: number; won: boolean }) {
  const salary = market.contract.weeklySalaryEur;
  const bonus = (input.appeared ? market.contract.appearanceBonusEur : 0) + input.goals * market.contract.goalBonusEur;
  const sponsor = market.sponsors.reduce((sum, item) => sum + item.weeklyEur, 0);
  const gross = salary + bonus + sponsor;
  const commission = Math.round((bonus + sponsor) * market.agent.commission / 100);
  const amountEur = gross - commission;
  const objectives = (market.objectives ?? [{ id: "appearances", label: "Występy", target: 18, progress: 0 }, { id: "goals", label: "Gole", target: 6, progress: 0 }, { id: "ratings", label: "Oceny 7+", target: 8, progress: 0 }]).map((objective) => ({ ...objective, progress: objective.progress + (objective.id === "appearances" && input.appeared ? 1 : objective.id === "goals" ? input.goals : objective.id === "ratings" && input.rating >= 7 ? 1 : 0) })) as CareerObjective[];
  market = { ...market, objectives };
  return { ...market, reputation: clamp(market.reputation + (input.rating - 6) * .9 + input.goals * 1.4 + (input.won ? .5 : 0)), relations: { coach: clamp(market.relations.coach + (input.rating - 6) * 1.2), teammates: clamp(market.relations.teammates + (input.rating - 6) * .7), fans: clamp(market.relations.fans + input.goals * 2 + (input.won ? 1 : -.4)), media: clamp(market.relations.media + input.goals * 1.3), agent: market.relations.agent }, ledger: [{ id: `week-${input.season}-${input.week}`, season: input.season, week: input.week, amountEur, label: `Pensja i premie (prowizja ${commission} €)` }, ...market.ledger].slice(0, 100) };
}

export function sponsorshipDecision(market: MarketState) {
  const available = SPONSORS[market.sponsors.length % SPONSORS.length];
  if (market.reputation < 45 + market.sponsors.length * 10 || market.sponsors.some((item) => item.name === available)) return market;
  return { ...market, sponsors: [...market.sponsors, { name: available, weeklyEur: 40 + Math.round(market.reputation * 1.8), reputationRequired: 45 + market.sponsors.length * 10 }] };
}

const DECISIONS: Array<Omit<WeeklyDecision, "id">> = [
  { title: "Korki z napisem ELITA", copy: "Nie są szybsze, ale pudełko twierdzi inaczej.", options: [{ id: "buy", label: "BIORĘ NA RATY", copy: "Morale i media w górę, konto w dół.", costEur: 180, reputation: 1, relations: { media: 3, fans: 2 } }, { id: "skip", label: "GRAM W STARYCH", copy: "Trener docenia rozsądek.", costEur: 0, reputation: 0, relations: { coach: 2 } }] },
  { title: "Wywiad po treningu", copy: "Reporter pyta, czy jesteś już gotowy na większy klub.", options: [{ id: "honest", label: "MÓWIĘ: JESZCZE NIE", copy: "Szatnia to kupuje.", costEur: 0, reputation: -1, relations: { teammates: 4, coach: 2 } }, { id: "star", label: "MÓWIĘ: OD DAWNA", copy: "Media mają nagłówek, trener ma notatnik.", costEur: 0, reputation: 3, relations: { media: 5, coach: -3 } }] },
  { title: "Składka na szatnię", copy: "Kapitan zbiera na ekspres, który podobno umie pressing.", options: [{ id: "pay", label: "DORZUCAM SIĘ", copy: "Koledzy pamiętają takie rzeczy.", costEur: 70, reputation: 0, relations: { teammates: 5 } }, { id: "water", label: "PIJĘ WODĘ", copy: "Agent chwali dyscyplinę finansową.", costEur: 0, reputation: 0, relations: { agent: 2, teammates: -1 } }] },
];

export function prepareWeeklyDecision(market: MarketState, season: number, week: number, seed: number) {
  if (market.weeklyDecision || week % 4 !== 0) return market;
  const decision = DECISIONS[hashSeed(`${seed}-${season}-${week}-life`) % DECISIONS.length];
  return { ...market, weeklyDecision: { ...decision, id: `decision-${season}-${week}` } };
}

export function resolveWeeklyDecision(market: MarketState, optionId: string, season: number, week: number) {
  const decision = market.weeklyDecision; const option = decision?.options.find((item) => item.id === optionId);
  if (!decision || !option) return { market, deltaEur: 0 };
  const relations = { ...market.relations };
  for (const [key, value] of Object.entries(option.relations)) relations[key as keyof CareerRelations] = clamp(relations[key as keyof CareerRelations] + (value ?? 0));
  const deltaEur = -option.costEur;
  return { deltaEur, market: { ...market, reputation: clamp(market.reputation + option.reputation), relations, weeklyDecision: null, ledger: [{ id: `${decision.id}-${option.id}`, season, week, amountEur: deltaEur, label: `${decision.title}: ${option.label}` }, ...market.ledger].slice(0, 100) } };
}
