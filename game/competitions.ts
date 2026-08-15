import { hashSeed, nextRandom } from "./rng";
import { sortedTable } from "./world";
import type { CountryCode, WorldState } from "./types";

export interface KnockoutTie { id: string; homeId: string; awayId: string; homeGoals?: number; awayGoals?: number; played: boolean }
export interface CupState { country: CountryCode; round: "preliminary" | "round32" | "round16" | "quarterfinal" | "semifinal" | "final" | "finished"; ties: KnockoutTie[]; winnerId: string | null }
export interface EuropeState { season: number; groups: string[][]; groupResults: Record<string, number>; knockout: KnockoutTie[]; round: "groups" | "round16" | "quarterfinal" | "semifinal" | "final" | "finished"; winnerId: string | null }
export interface NationalTeamState { country: CountryCode; strength: number; calledUp: boolean }
export interface InternationalTournamentState { active: boolean; groups: CountryCode[][]; groupPoints: Partial<Record<CountryCode, number>>; phase: "inactive" | "groups" | "semifinal" | "final" | "finished"; knockout: Array<{ home: CountryCode; away: CountryCode; homeGoals?: number; awayGoals?: number }>; champion: CountryCode | null }
export interface CompetitionsState { season: number; cups: Record<CountryCode, CupState>; europe: EuropeState; nationalTeams: NationalTeamState[]; internationalTournament: InternationalTournamentState }

const ROUND_LABELS: Record<CupState["round"] | EuropeState["round"] | InternationalTournamentState["phase"], string> = {
  preliminary: "RUNDA WSTĘPNA",
  groups: "FAZA GRUPOWA",
  round32: "1/16 FINAŁU",
  round16: "1/8 FINAŁU",
  quarterfinal: "ĆWIERĆFINAŁ",
  semifinal: "PÓŁFINAŁ",
  final: "FINAŁ",
  finished: "ZAKOŃCZONE",
  inactive: "NIEAKTYWNE",
};
export const competitionRoundLabel = (round: keyof typeof ROUND_LABELS) => ROUND_LABELS[round];

const CODES: CountryCode[] = ["PL", "DE", "IT", "NL", "FR", "EN", "PT", "ES"];
const CUP_WEEKS = [3, 7, 11, 17, 23, 29];
const EUROPE_WEEKS = [4, 8, 12, 16, 20, 24, 28];
const NATIONAL_WEEKS = [6, 14, 18, 22, 30];
const pair = (ids: string[], prefix: string): KnockoutTie[] => Array.from({ length: Math.floor(ids.length / 2) }, (_, index) => ({ id: `${prefix}-${index}`, homeId: ids[index * 2], awayId: ids[index * 2 + 1], played: false }));
function seededShuffle<T>(items: T[], seed: number) { const result = [...items]; let state = seed; for (let index = result.length - 1; index > 0; index -= 1) { const roll = nextRandom(state); state = roll.state; const target = Math.floor(roll.value * (index + 1)); [result[index], result[target]] = [result[target], result[index]]; } return result; }

export function createCompetitions(world: WorldState, playerCountry: CountryCode, playerOvr: number, previous?: CompetitionsState): CompetitionsState {
  const cups = Object.fromEntries(CODES.map((country) => {
    const lower = [...world.leagues[`${country}-L2`].clubIds, ...world.leagues[`${country}-L3`].clubIds];
    return [country, { country, round: "preliminary", ties: pair(seededShuffle(lower, hashSeed(`${world.seed}-${world.season}-${country}-cup`)), `${country}-cup-pre`), winnerId: null } satisfies CupState];
  })) as Record<CountryCode, CupState>;
  const qualifiers = CODES.flatMap((country) => {
    const table = sortedTable(world.leagues[`${country}-L1`]);
    const qualified = table.slice(0, 3).map((row) => row.clubId);
    const cupWinner = previous?.cups[country].winnerId;
    if (cupWinner && !qualified.includes(cupWinner)) qualified.push(cupWinner);
    else qualified.push(table.find((row) => !qualified.includes(row.clubId))!.clubId);
    return qualified;
  });
  const shuffled = seededShuffle(qualifiers, hashSeed(`${world.seed}-${world.season}-europe`));
  const groups = Array.from({ length: 8 }, (_, index) => shuffled.slice(index * 4, index * 4 + 4));
  const nationalTeams = CODES.map((country) => ({ country, strength: 68 + (hashSeed(`${world.seed}-${country}-national`) % 170) / 10, calledUp: country === playerCountry && playerOvr >= 68 }));
  const active = world.season % 2 === 0;
  return { season: world.season, cups, europe: { season: world.season, groups, groupResults: {}, knockout: [], round: "groups", winnerId: null }, nationalTeams, internationalTournament: { active, groups: [["PL","DE","IT","NL"],["FR","EN","PT","ES"]], groupPoints: {}, phase: active ? "groups" : "inactive", knockout: [], champion: null } };
}

function simulateTie(tie: KnockoutTie, world: WorldState, seed: number) {
  if (tie.played) return tie;
  const home = world.clubs[tie.homeId]; const away = world.clubs[tie.awayId]; let state = seed;
  const homeRoll = nextRandom(state); state = homeRoll.state; const awayRoll = nextRandom(state); state = awayRoll.state;
  let homeGoals = Math.floor(homeRoll.value * 4 + Math.max(0, home.strength - away.strength) / 18);
  let awayGoals = Math.floor(awayRoll.value * 4 + Math.max(0, away.strength - home.strength) / 18);
  if (homeGoals === awayGoals) {
    if (nextRandom(state).value < .52) homeGoals += 1; else awayGoals += 1;
  }
  return { ...tie, homeGoals, awayGoals, played: true };
}

export interface SpecialFixture { kind: "cup" | "europe" | "national"; fixtureId: string; opponentId: string; label: string }

const nationalGroupPairs = (week: number) => week === 6 ? [[0,1],[2,3]] : week === 14 ? [[0,2],[1,3]] : [[0,3],[1,2]];

export function getPlayerNationalFixture(state: CompetitionsState, country: CountryCode, week: number): SpecialFixture | null {
  const team = state.nationalTeams.find((item) => item.country === country);
  const tournament = state.internationalTournament;
  if (!team?.calledUp || !tournament.active || !NATIONAL_WEEKS.includes(week)) return null;
  if (tournament.phase === "groups" && [6, 14, 18].includes(week)) {
    const groupIndex = tournament.groups.findIndex((group) => group.includes(country));
    if (groupIndex < 0) return null;
    const group = tournament.groups[groupIndex]; const playerIndex = group.indexOf(country);
    const pairing = nationalGroupPairs(week).find(([a,b]) => a === playerIndex || b === playerIndex);
    if (!pairing) return null;
    const opponentIndex = pairing[0] === playerIndex ? pairing[1] : pairing[0];
    return { kind: "national", fixtureId: `nat-g${groupIndex}-w${week}-${Math.floor(playerIndex / 2)}`, opponentId: group[opponentIndex], label: `Reprezentacja • grupa ${String.fromCharCode(65 + groupIndex)}` };
  }
  if ((tournament.phase === "semifinal" && week === 22) || (tournament.phase === "final" && week === 30)) {
    const index = tournament.knockout.findIndex((tie) => tie.home === country || tie.away === country);
    const tie = tournament.knockout[index];
    if (!tie || tie.homeGoals !== undefined) return null;
    return { kind: "national", fixtureId: `nat-${tournament.phase}-${index}`, opponentId: tie.home === country ? tie.away : tie.home, label: `Reprezentacja • ${tournament.phase === "semifinal" ? "półfinał" : "finał"}` };
  }
  return null;
}

export function getPlayerCompetitionFixture(state: CompetitionsState, clubId: string, country: CountryCode, week: number): SpecialFixture | null {
  if (EUROPE_WEEKS.includes(week)) {
    if (state.europe.round === "groups") {
      const groupIndex = state.europe.groups.findIndex((group) => group.includes(clubId));
      if (groupIndex >= 0) {
        const group = state.europe.groups[groupIndex]; const playerIndex = group.indexOf(clubId);
        const pairs = week === 4 ? [[0,1],[2,3]] : week === 8 ? [[0,2],[1,3]] : [[0,3],[1,2]];
        const pairing = pairs.find(([a,b]) => a === playerIndex || b === playerIndex);
        if (pairing) { const opponentIndex = pairing[0] === playerIndex ? pairing[1] : pairing[0]; return { kind: "europe", fixtureId: `eu-g${groupIndex}-${week}-${Math.floor(playerIndex / 2)}`, opponentId: group[opponentIndex], label: `Europa • grupa ${String.fromCharCode(65 + groupIndex)}` }; }
      }
    } else {
      const tie = state.europe.knockout.find((item) => !item.played && (item.homeId === clubId || item.awayId === clubId));
      if (tie) return { kind: "europe", fixtureId: tie.id, opponentId: tie.homeId === clubId ? tie.awayId : tie.homeId, label: `Europa • ${competitionRoundLabel(state.europe.round)}` };
    }
  }
  if (CUP_WEEKS.includes(week)) {
    const tie = state.cups[country].ties.find((item) => !item.played && (item.homeId === clubId || item.awayId === clubId));
    if (tie) return { kind: "cup", fixtureId: tie.id, opponentId: tie.homeId === clubId ? tie.awayId : tie.homeId, label: `Puchar kraju • ${competitionRoundLabel(state.cups[country].round)}` };
  }
  return null;
}

export function recordPlayerCompetitionResult(state: CompetitionsState, fixture: SpecialFixture, clubId: string, playerGoals: number, opponentGoals: number) {
  const next = structuredClone(state);
  if (fixture.kind === "national") {
    const country = clubId as CountryCode;
    if (next.internationalTournament.phase === "groups") {
      if (playerGoals === opponentGoals) {
        next.internationalTournament.groupPoints[country] = (next.internationalTournament.groupPoints[country] ?? 0) + 1;
        next.internationalTournament.groupPoints[fixture.opponentId as CountryCode] = (next.internationalTournament.groupPoints[fixture.opponentId as CountryCode] ?? 0) + 1;
      } else {
        const winner = playerGoals > opponentGoals ? country : fixture.opponentId as CountryCode;
        next.internationalTournament.groupPoints[winner] = (next.internationalTournament.groupPoints[winner] ?? 0) + 3;
      }
    } else {
      const index = Number(fixture.fixtureId.split("-").at(-1));
      const tie = next.internationalTournament.knockout[index];
      if (tie) {
        const playerHome = tie.home === country;
        tie.homeGoals = playerHome ? playerGoals : opponentGoals; tie.awayGoals = playerHome ? opponentGoals : playerGoals;
        if (tie.homeGoals === tie.awayGoals) { if (playerHome) tie.homeGoals += 1; else tie.awayGoals += 1; }
      }
    }
  } else if (fixture.kind === "cup") {
    const cup = Object.values(next.cups).find((candidate) => candidate.ties.some((tie) => tie.id === fixture.fixtureId));
    const tie = cup?.ties.find((candidate) => candidate.id === fixture.fixtureId);
    if (tie) { const playerHome = tie.homeId === clubId; tie.homeGoals = playerHome ? playerGoals : opponentGoals; tie.awayGoals = playerHome ? opponentGoals : playerGoals; if (tie.homeGoals === tie.awayGoals) { if (playerHome) tie.homeGoals += 1; else tie.awayGoals += 1; } tie.played = true; }
  } else if (next.europe.round === "groups") {
    const winner = playerGoals === opponentGoals ? null : playerGoals > opponentGoals ? clubId : fixture.opponentId;
    if (winner) next.europe.groupResults[winner] = (next.europe.groupResults[winner] ?? 0) + 3;
    else { next.europe.groupResults[clubId] = (next.europe.groupResults[clubId] ?? 0) + 1; next.europe.groupResults[fixture.opponentId] = (next.europe.groupResults[fixture.opponentId] ?? 0) + 1; }
  } else {
    const tie = next.europe.knockout.find((candidate) => candidate.id === fixture.fixtureId);
    if (tie) { const playerHome = tie.homeId === clubId; tie.homeGoals = playerHome ? playerGoals : opponentGoals; tie.awayGoals = playerHome ? opponentGoals : playerGoals; if (tie.homeGoals === tie.awayGoals) { if (playerHome) tie.homeGoals += 1; else tie.awayGoals += 1; } tie.played = true; }
  }
  return next;
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

function advanceEurope(europe: EuropeState, world: WorldState, week: number, excludedClubId?: string) {
  if (europe.round === "finished") return europe;
  if (europe.round === "groups") {
    const groupResults = { ...europe.groupResults };
    europe.groups.forEach((group, groupIndex) => {
      const rotation = week === 4 ? [[0,1],[2,3]] : week === 8 ? [[0,2],[1,3]] : [[0,3],[1,2]];
      rotation.forEach(([homeIndex, awayIndex], matchIndex) => {
        if (excludedClubId && (group[homeIndex] === excludedClubId || group[awayIndex] === excludedClubId)) return;
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

export function advanceCompetitionsWeek(state: CompetitionsState, world: WorldState, week: number, excludedClubId?: string, excludedCountry?: CountryCode) {
  let next = state;
  if (CUP_WEEKS.includes(week)) next = { ...next, cups: Object.fromEntries(Object.entries(next.cups).map(([country, cup]) => [country, advanceCup(cup, world)])) as Record<CountryCode, CupState> };
  if (EUROPE_WEEKS.includes(week)) next = { ...next, europe: advanceEurope(next.europe, world, week, excludedClubId) };
  if (next.internationalTournament.active && NATIONAL_WEEKS.includes(week)) next = { ...next, internationalTournament: advanceInternationalTournament(next.internationalTournament, next.nationalTeams, world.seed, week, excludedCountry) };
  return next;
}

function nationalScore(country: CountryCode, teams: NationalTeamState[], seed: number) {
  const team = teams.find((item) => item.country === country)!;
  return Math.floor(nextRandom(hashSeed(`${seed}-${country}`)).value * 3 + Math.max(0, team.strength - 72) / 12);
}

function advanceInternationalTournament(tournament: InternationalTournamentState, teams: NationalTeamState[], seed: number, week: number, excludedCountry?: CountryCode): InternationalTournamentState {
  if (!tournament.active || tournament.phase === "finished") return tournament;
  if (tournament.phase === "groups") {
    const groupPoints = { ...tournament.groupPoints };
    tournament.groups.forEach((group, groupIndex) => {
      const pairs = nationalGroupPairs(week);
      pairs.forEach(([a,b], index) => {
        const home = group[a]; const away = group[b];
        if (excludedCountry && (home === excludedCountry || away === excludedCountry)) return;
        const homeGoals = nationalScore(home, teams, hashSeed(`${seed}-${week}-${groupIndex}-${index}-h`));
        const awayGoals = nationalScore(away, teams, hashSeed(`${seed}-${week}-${groupIndex}-${index}-a`));
        if (homeGoals === awayGoals) { groupPoints[home] = (groupPoints[home] ?? 0) + 1; groupPoints[away] = (groupPoints[away] ?? 0) + 1; }
        else { const winner = homeGoals > awayGoals ? home : away; groupPoints[winner] = (groupPoints[winner] ?? 0) + 3; }
      });
    });
    if (week < 18) return { ...tournament, groupPoints };
    const qualified = tournament.groups.map((group) => [...group].sort((a,b) => (groupPoints[b] ?? 0) - (groupPoints[a] ?? 0)).slice(0,2));
    return { ...tournament, groupPoints, phase: "semifinal", knockout: [{ home: qualified[0][0], away: qualified[1][1] }, { home: qualified[1][0], away: qualified[0][1] }] };
  }
  const played = tournament.knockout.map((tie,index) => {
    if (excludedCountry && (tie.home === excludedCountry || tie.away === excludedCountry)) return tie;
    let homeGoals = nationalScore(tie.home, teams, hashSeed(`${seed}-${week}-${index}-h`)); let awayGoals = nationalScore(tie.away, teams, hashSeed(`${seed}-${week}-${index}-a`));
    if (homeGoals === awayGoals) homeGoals += nextRandom(hashSeed(`${seed}-${week}-${index}-pens`)).value < .5 ? 1 : 0; if (homeGoals === awayGoals) awayGoals += 1;
    return { ...tie, homeGoals, awayGoals };
  });
  if (played.some((tie) => tie.homeGoals === undefined || tie.awayGoals === undefined)) return { ...tournament, knockout: played };
  const winners = played.map((tie) => (tie.homeGoals ?? 0) > (tie.awayGoals ?? 0) ? tie.home : tie.away);
  if (tournament.phase === "semifinal") return { ...tournament, phase: "final", knockout: [{ home: winners[0], away: winners[1] }] };
  return { ...tournament, phase: "finished", knockout: played, champion: winners[0] };
}
