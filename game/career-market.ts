import { hashSeed, nextRandom, randomInt } from "./rng";
import type { Position, WorldState } from "./types";

export interface ContractState { clubId: string; startSeason: number; endSeason: number; weeklySalaryEur: number; appearanceBonusEur: number; goalBonusEur: number; releaseClauseEur: number; promisedRole: "prospekt" | "rotacja" | "pierwszy skład" | "gwiazda" }
export interface TransferOffer { id: string; clubId: string; salaryEur: number; signingBonusEur: number; length: number; promisedRole: ContractState["promisedRole"]; interest: number; expiresWeek: number }
export interface CareerRelations { coach: number; teammates: number; fans: number; media: number; agent: number }
export interface FinanceEntry { id: string; season: number; week: number; amountEur: number; label: string }
export interface MarketState {
  contract: ContractState;
  agent: { name: string; commission: number; skill: number };
  reputation: number;
  relations: CareerRelations;
  offers: TransferOffer[];
  sponsors: Array<{ name: string; weeklyEur: number; reputationRequired: number }>;
  ledger: FinanceEntry[];
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
    offers.push({ id: `${input.season}-${input.week}-${club.id}`, clubId: club.id, salaryEur, signingBonusEur: Math.round(salaryEur * (5 + market.agent.skill / 20)), length: 2 + Math.floor(wageRoll.value * 3), promisedRole: role, interest: Math.round(clamp(55 + (input.ovr - club.strength) * 2 + wageRoll.value * 22)), expiresWeek: input.week === 30 ? 1 : Math.min(30, input.week + 2) });
  }
  return { ...market, offers };
}

export function acceptTransfer(market: MarketState, offer: TransferOffer, season: number, week: number) {
  const commission = Math.round(offer.signingBonusEur * market.agent.commission / 100);
  return { ...market, contract: { clubId: offer.clubId, startSeason: season, endSeason: season + offer.length, weeklySalaryEur: offer.salaryEur, appearanceBonusEur: Math.round(offer.salaryEur * .3), goalBonusEur: Math.round(offer.salaryEur * .5), releaseClauseEur: offer.salaryEur * 650, promisedRole: offer.promisedRole }, offers: [], relations: { ...market.relations, coach: 50, teammates: 48, fans: 45, agent: clamp(market.relations.agent + 4) }, ledger: [{ id: `sign-${offer.id}`, season, week, amountEur: offer.signingBonusEur - commission, label: `Premia za podpis (po prowizji ${commission} €)` }, ...market.ledger].slice(0, 100) };
}

export function settleCareerWeek(market: MarketState, input: { season: number; week: number; appeared: boolean; goals: number; rating: number; won: boolean }) {
  const salary = market.contract.weeklySalaryEur;
  const bonus = (input.appeared ? market.contract.appearanceBonusEur : 0) + input.goals * market.contract.goalBonusEur;
  const sponsor = market.sponsors.reduce((sum, item) => sum + item.weeklyEur, 0);
  const gross = salary + bonus + sponsor;
  const commission = Math.round((bonus + sponsor) * market.agent.commission / 100);
  const amountEur = gross - commission;
  return { ...market, reputation: clamp(market.reputation + (input.rating - 6) * .9 + input.goals * 1.4 + (input.won ? .5 : 0)), relations: { coach: clamp(market.relations.coach + (input.rating - 6) * 1.2), teammates: clamp(market.relations.teammates + (input.rating - 6) * .7), fans: clamp(market.relations.fans + input.goals * 2 + (input.won ? 1 : -.4)), media: clamp(market.relations.media + input.goals * 1.3), agent: market.relations.agent }, ledger: [{ id: `week-${input.season}-${input.week}`, season: input.season, week: input.week, amountEur, label: `Pensja i premie (prowizja ${commission} €)` }, ...market.ledger].slice(0, 100) };
}

export function sponsorshipDecision(market: MarketState) {
  const available = SPONSORS[market.sponsors.length % SPONSORS.length];
  if (market.reputation < 45 + market.sponsors.length * 10 || market.sponsors.some((item) => item.name === available)) return market;
  return { ...market, sponsors: [...market.sponsors, { name: available, weeklyEur: 40 + Math.round(market.reputation * 1.8), reputationRequired: 45 + market.sponsors.length * 10 }] };
}
