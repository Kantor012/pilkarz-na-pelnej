import { createMarketState, type MarketState } from "./career-market";
import { createCompetitions, type CompetitionsState } from "./competitions";
import { emptyDevelopmentState, type DevelopmentState } from "./development";
import { defaultMetaGame, type MetaGameState } from "./meta-game";
import { createClubSquad, type ClubSquadState, type PlayerAvailability } from "./squad";
import type { OffseasonState } from "./season-flow";
import { createWorld, findClubByName, seedForNewCareer } from "./world";
import type { Attributes, CountryCode, Position } from "./types";

export interface CareerSaveV3 {
  player: { name: string; position: Position; foot: "Prawa" | "Lewa"; number: number; attrs: Attributes; potential: number; style: string };
  age: number;
  nationality: CountryCode;
  clubId: string;
  leagueId: string;
  season: number;
  week: number;
  energy: number;
  morale: number;
  managerTrust: number;
  money: number;
  trainingDone: boolean;
  weekEnergyStart?: number;
  weekPlanEnergy?: number;
  offseason?: OffseasonState;
  hiddenTalent: string;
  hiddenRevealed: boolean;
  trainingCount: number;
  totals: { matches: number; goals: number; assists: number; saves: number; rating: number };
  squad?: ClubSquadState;
  availability?: PlayerAvailability;
  development?: DevelopmentState;
  market?: MarketState;
  competitions?: CompetitionsState;
  meta?: MetaGameState;
  retired?: boolean;
}

const DEFAULT_ATTRIBUTES: Attributes = { technika: 45, strzal: 45, podania: 45, drybling: 45, odbior: 45, szybkosc: 45, sila: 45, kondycja: 45, refleks: 45 };
const POSITIONS: Position[] = ["Napastnik", "Pomocnik", "Obrońca", "Bramkarz"];
const COUNTRIES: CountryCode[] = ["PL", "DE", "IT", "NL", "FR", "EN", "PT", "ES"];
const number = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function migrateLegacyCareerV2(raw: unknown) {
  const legacy = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown> & { player?: Record<string, unknown>; totals?: Record<string, unknown> };
  const sourcePlayer = legacy.player ?? {};
  const name = String(sourcePlayer.name ?? "Zawodnik");
  const seed = seedForNewCareer(name);
  const world = createWorld(seed);
  const club = findClubByName(world, String(sourcePlayer.club ?? "LKS Drobny Druk"));
  const position = POSITIONS.includes(sourcePlayer.position as Position) ? sourcePlayer.position as Position : "Pomocnik";
  const attrs = { ...DEFAULT_ATTRIBUTES, ...((sourcePlayer.attrs && typeof sourcePlayer.attrs === "object") ? sourcePlayer.attrs : {}) } as Attributes;
  const ovr = number(sourcePlayer.ovr, Object.values(attrs).reduce((sum, value) => sum + value, 0) / Object.values(attrs).length);
  const season = Math.max(1, number(legacy.season, 1));
  const nationality = COUNTRIES.includes(legacy.nationality as CountryCode) ? legacy.nationality as CountryCode : "PL";
  const totals = legacy.totals ?? {};
  const availability: PlayerAvailability = { injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, matchSharpness: 62 };
  const career: CareerSaveV3 = {
    player: {
      name,
      position,
      foot: sourcePlayer.foot === "Lewa" ? "Lewa" : "Prawa",
      number: number(sourcePlayer.number, position === "Bramkarz" ? 1 : 8),
      attrs,
      potential: number(sourcePlayer.potential, 86),
      style: String(sourcePlayer.style ?? "Dyrygent"),
    },
    age: Math.max(16, number(legacy.age, 18)), nationality, clubId: club.id, leagueId: `${club.country}-L${club.tier}`,
    season, week: Math.max(1, Math.min(30, number(legacy.week, 1))), energy: number(legacy.energy, 75), morale: number(legacy.morale, 70), managerTrust: number(legacy.managerTrust, 50), money: number(legacy.money, 800), trainingDone: Boolean(legacy.trainingDone),
    hiddenTalent: String(legacy.hiddenTalent ?? "Losowy"), hiddenRevealed: Boolean(legacy.hiddenRevealed), trainingCount: number(legacy.trainingCount, 0),
    totals: { matches: number(totals.matches, 0), goals: number(totals.goals, 0), assists: number(totals.assists, 0), saves: number(totals.saves, 0), rating: number(totals.rating, 0) },
    squad: createClubSquad(world, club.id), availability, development: emptyDevelopmentState(), market: createMarketState(club.id, season, ovr, seed), competitions: createCompetitions(world, nationality, ovr), meta: defaultMetaGame(),
  };
  return { seed, world, career };
}
