import { hashSeed, nextRandom } from "./rng";
import { sortedTable } from "./world";
import type { CountryCode, WorldState } from "./types";

export interface KnockoutTie { id: string; homeId: string; awayId: string; homeGoals?: number; awayGoals?: number; played: boolean }
export interface CupState { country: CountryCode; round: "preliminary" | "round32" | "round16" | "quarterfinal" | "semifinal" | "final" | "finished"; ties: KnockoutTie[]; winnerId: string | null }
export interface EuropeState { season: number; groups: string[][]; groupResults: Record<string, number>; knockout: KnockoutTie[]; round: "groups" | "round16" | "quarterfinal" | "semifinal" | "final" | "finished"; winnerId: string | null }
export interface NationalTeamState { country: CountryCode; strength: number; calledUp: boolean }
export interface CompetitionsState { season: number; cups: Record<CountryCode, CupState>; europe: EuropeState; nationalTeams: NationalTeamState[]; internationalTournament: { active: boolean; groups: CountryCode[][]; champion: CountryCode | null } }

const CODES: CountryCode[] = ["PL", "DE", "IT", "NL", "FR", "EN", "PT", "ES"];
const pair = (ids: string[], prefix: string): KnockoutTie[] => Array.from({ length: Math.floor(ids.length / 2) }, (_, index) => ({ id: `${prefix}-${index}`, homeId: ids[index * 2], awayId: ids[index * 2 + 1], played: false }));
function seededShuffle<T>(items: T[], seed: number) { const result = [...items]; let state = seed; for (let index = result.length - 1; index > 0; index -= 1) { const roll = nextRandom(state); state = roll.state; const target = Math.floor(roll.value * (index + 1)); [result[index], result[target]] = [result[target], result[index]]; } return result; }

export function createCompetitions(world: WorldState, playerCountry: CountryCode, playerOvr: number): CompetitionsState {
  const cups = Object.fromEntries(CODES.map((country) => {
    const lower = [...world.leagues[`${country}-L2`].clubIds, ...world.leagues[`${country}-L3`].clubIds];
    return [country, { country, round: "preliminary", ties: pair(seededShuffle(lower, hashSeed(`${world.seed}-${world.season}-${country}-cup`)), `${country}-cup-pre`), winnerId: null } satisfies CupState];
  })) as Record<CountryCode, CupState>;
  const qualifiers = CODES.flatMap((country) => sortedTable(world.leagues[`${country}-L1`]).slice(0, 4).map((row) => row.clubId));
  const shuffled = seededShuffle(qualifiers, hashSeed(`${world.seed}-${world.season}-europe`));
  const groups = Array.from({ length: 8 }, (_, index) => shuffled.slice(index * 4, index * 4 + 4));
  const nationalTeams = CODES.map((country) => ({ country, strength: 68 + (hashSeed(`${world.seed}-${country}-national`) % 170) / 10, calledUp: country === playerCountry && playerOvr >= 68 }));
  return { season: world.season, cups, europe: { season: world.season, groups, groupResults: {}, knockout: [], round: "groups", winnerId: null }, nationalTeams, internationalTournament: { active: world.season % 2 === 0, groups: [["PL","DE","IT","NL"],["FR","EN","PT","ES"]], champion: null } };
}

function simulateTie(tie: KnockoutTie, world: WorldState, seed: number) {
  const home = world.clubs[tie.homeId]; const away = world.clubs[tie.awayId]; let state = seed;
  const homeRoll = nextRandom(state); state = homeRoll.state; const awayRoll = nextRandom(state); state = awayRoll.state;
  let homeGoals = Math.floor(homeRoll.value * 4 + Math.max(0, home.strength - away.strength) / 18);
  let awayGoals = Math.floor(awayRoll.value * 4 + Math.max(0, away.strength - home.strength) / 18);
  if (homeGoals === awayGoals) {
    if (nextRandom(state).value < .52) homeGoals += 1; else awayGoals += 1;
  }
  return { ...tie, homeGoals, awayGoals, played: true };
}

const nextCupRound = (round: CupState["round"]): CupState["round"] => round === "preliminary" ? "round32" : round === "round32" ? "round16" : round === "round16" ? "quarterfinal" : round === "quarterfinal" ? "semifinal" : round === "semifinal" ? "final" : "finished";

export function advanceCup(cup: CupState, world: WorldState) {
  const played = cup.ties.map((tie, index) => simulateTie(tie, world, hashSeed(`${world.seed}-${world.season}-${cup.country}-${cup.round}-${index}`)));
  const winners = played.map((tie) => (tie.homeGoals ?? 0) > (tie.awayGoals ?? 0) ? tie.homeId : tie.awayId);
  if (cup.round === "final") return { ...cup, ties: played, round: "finished" as const, winnerId: winners[0] };
  const nextRound = nextCupRound(cup.round);
  const entrants = cup.round === "preliminary" ? [...winners, ...world.leagues[`${cup.country}-L1`].clubIds] : winners;
  return { ...cup, round: nextRound, ties: pair(seededShuffle(entrants, hashSeed(`${world.seed}-${world.season}-${cup.country}-${nextRound}`)), `${cup.country}-cup-${nextRound}`) };
}

export function updateCallUp(state: CompetitionsState, country: CountryCode, ovr: number, form: number, minutes: number) {
  return { ...state, nationalTeams: state.nationalTeams.map((team) => team.country === country ? { ...team, calledUp: ovr * .65 + form * .25 + Math.min(10, minutes / 180) >= 65 } : team) };
}

function advanceEurope(europe: EuropeState, world: WorldState, week: number) {
  if (europe.round === "finished") return europe;
  if (europe.round === "groups") {
    const groupResults = { ...europe.groupResults };
    europe.groups.forEach((group, groupIndex) => {
      const rotation = week === 4 ? [[0,1],[2,3]] : week === 8 ? [[0,2],[1,3]] : [[0,3],[1,2]];
      rotation.forEach(([homeIndex, awayIndex], matchIndex) => {
        const tie = simulateTie({ id: `eu-g${groupIndex}-${week}-${matchIndex}`, homeId: group[homeIndex], awayId: group[awayIndex], played: false }, world, hashSeed(`${world.seed}-${world.season}-eu-${groupIndex}-${week}-${matchIndex}`));
        const winner = (tie.homeGoals ?? 0) > (tie.awayGoals ?? 0) ? tie.homeId : tie.awayId;
        groupResults[winner] = (groupResults[winner] ?? 0) + 3;
      });
    });
    if (week < 12) return { ...europe, groupResults };
    const qualified = europe.groups.flatMap((group) => [...group].sort((a,b) => (groupResults[b] ?? 0) - (groupResults[a] ?? 0)).slice(0,2));
    return { ...europe, groupResults, round: "round16" as const, knockout: pair(seededShuffle(qualified, hashSeed(`${world.seed}-${world.season}-eu-r16`)), "eu-r16") };
  }
  const played = europe.knockout.map((tie,index) => simulateTie(tie, world, hashSeed(`${world.seed}-${world.season}-eu-${europe.round}-${index}`)));
  const winners = played.map((tie) => (tie.homeGoals ?? 0) > (tie.awayGoals ?? 0) ? tie.homeId : tie.awayId);
  if (europe.round === "final") return { ...europe, knockout: played, round: "finished" as const, winnerId: winners[0] };
  const nextRound = europe.round === "round16" ? "quarterfinal" : europe.round === "quarterfinal" ? "semifinal" : "final";
  return { ...europe, knockout: pair(winners, `eu-${nextRound}`), round: nextRound };
}

export function advanceCompetitionsWeek(state: CompetitionsState, world: WorldState, week: number) {
  const cupWeeks = [3, 7, 11, 17, 23, 29];
  const europeWeeks = [4, 8, 12, 16, 20, 24, 28];
  let next = state;
  if (cupWeeks.includes(week)) next = { ...next, cups: Object.fromEntries(Object.entries(next.cups).map(([country, cup]) => [country, advanceCup(cup, world)])) as Record<CountryCode, CupState> };
  if (europeWeeks.includes(week)) next = { ...next, europe: advanceEurope(next.europe, world, week) };
  if (week === 30 && next.internationalTournament.active) {
    const champion = [...next.nationalTeams].sort((a,b) => b.strength - a.strength || a.country.localeCompare(b.country))[0].country;
    next = { ...next, internationalTournament: { ...next.internationalTournament, champion } };
  }
  return next;
}
