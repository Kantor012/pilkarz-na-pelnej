import { hashSeed, nextRandom, randomInt } from "./rng";
import { materializePlayer } from "./world";
import type { MatchRole, Position, WorldState } from "./types";

export interface SquadMember {
  id: string;
  name: string;
  position: Position;
  age: number;
  ovr: number;
  potential: number;
  form: number;
  fitness: number;
  morale: number;
  injuryWeeks: number;
  yellowCards: number;
  suspendedMatches: number;
  squadStatus: "prospekt" | "rezerwowy" | "rotacja" | "pierwszy skład" | "gwiazda";
}

export interface CoachProfile {
  id: string;
  name: string;
  formation: "4-3-3" | "4-2-3-1" | "3-5-2";
  mentality: "ostrożna" | "zrównoważona" | "ofensywna";
  strictness: number;
  rotation: number;
}

export interface ClubSquadState {
  clubId: string;
  coach: CoachProfile;
  members: SquadMember[];
}

export interface PlayerAvailability {
  injuryWeeks: number;
  yellowCards: number;
  suspendedMatches: number;
  matchSharpness: number;
}

export interface LineupDecision {
  role: MatchRole;
  positionRank: number;
  score: number;
  reasons: string[];
  competitors: SquadMember[];
  predictedMinute: number | null;
}

const COACH_FIRST = ["Roman", "Bogdan", "Mirosław", "Dariusz", "Zbigniew", "Ryszard", "Waldemar", "Czesław"];
const COACH_LAST = ["Tablica", "Pressing", "Gwizdek", "Kołnierz", "Notatnik", "Autobus", "Rotacja", "Stały Fragment"];
const FORMATIONS: CoachProfile["formation"][] = ["4-3-3", "4-2-3-1", "3-5-2"];
const MENTALITIES: CoachProfile["mentality"][] = ["ostrożna", "zrównoważona", "ofensywna"];

export function createClubSquad(world: WorldState, clubId: string): ClubSquadState {
  let state = hashSeed(`${world.seed}-${clubId}-squad`);
  const members = Array.from({ length: 23 }, (_, slot) => {
    const generated = materializePlayer(world, clubId, slot);
    const form = randomInt(state, 48, 82); state = form.state;
    const fitness = randomInt(state, 68, 100); state = fitness.state;
    const morale = randomInt(state, 48, 86); state = morale.state;
    const status: SquadMember["squadStatus"] = generated.ovr >= world.clubs[clubId].strength + 5 ? "gwiazda" : generated.ovr >= world.clubs[clubId].strength + 1 ? "pierwszy skład" : generated.age <= 20 ? "prospekt" : generated.ovr >= world.clubs[clubId].strength - 4 ? "rotacja" : "rezerwowy";
    return { ...generated, form: form.value, fitness: fitness.value, morale: morale.value, injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, squadStatus: status };
  });
  const coachFirst = randomInt(state, 0, COACH_FIRST.length - 1); state = coachFirst.state;
  const coachLast = randomInt(state, 0, COACH_LAST.length - 1); state = coachLast.state;
  const formation = randomInt(state, 0, FORMATIONS.length - 1); state = formation.state;
  const mentality = randomInt(state, 0, MENTALITIES.length - 1); state = mentality.state;
  const strictness = randomInt(state, 35, 88); state = strictness.state;
  const rotation = randomInt(state, 28, 82);
  return { clubId, coach: { id: `${clubId}-coach`, name: `${COACH_FIRST[coachFirst.value]} ${COACH_LAST[coachLast.value]}`, formation: FORMATIONS[formation.value], mentality: MENTALITIES[mentality.value], strictness: strictness.value, rotation: rotation.value }, members };
}

function placesForPosition(formation: CoachProfile["formation"], position: Position) {
  if (position === "Bramkarz") return 1;
  if (formation === "3-5-2") return position === "Obrońca" ? 3 : position === "Pomocnik" ? 5 : 2;
  if (formation === "4-2-3-1") return position === "Obrońca" ? 4 : position === "Pomocnik" ? 5 : 1;
  return position === "Obrońca" ? 4 : 3;
}

const memberScore = (member: SquadMember) => member.ovr * .62 + member.form * .18 + member.fitness * .12 + member.morale * .08;

export function selectPlayerForMatch(squad: ClubSquadState, player: { position: Position; ovr: number; energy: number; morale: number; managerTrust: number; availability: PlayerAvailability }): LineupDecision {
  const competitors = squad.members.filter((member) => member.position === player.position).sort((a, b) => memberScore(b) - memberScore(a));
  const score = player.ovr * .62 + player.energy * .12 + player.morale * .08 + player.managerTrust * .18;
  const available = player.availability.injuryWeeks <= 0 && player.availability.suspendedMatches <= 0;
  const positionRank = competitors.filter((member) => member.injuryWeeks <= 0 && member.suspendedMatches <= 0 && memberScore(member) > score).length + 1;
  const places = placesForPosition(squad.coach.formation, player.position);
  let role: MatchRole = !available ? "out" : positionRank <= places ? "starter" : positionRank <= places + (player.position === "Bramkarz" ? 1 : 2) ? "bench" : "out";
  if (available && role === "out" && squad.coach.rotation > 68 && positionRank === places + 3) role = "bench";
  const reasons = [
    `miejsce ${positionRank}. w hierarchii pozycji`,
    `OVR ${player.ovr.toFixed(1)} przy średniej konkurentów ${(competitors.reduce((sum, member) => sum + member.ovr, 0) / Math.max(1, competitors.length)).toFixed(1)}`,
    `zaufanie trenera ${Math.round(player.managerTrust)}%`,
  ];
  if (player.energy < 45) reasons.push("niska energia obniża gotowość");
  if (player.availability.injuryWeeks > 0) reasons.unshift(`kontuzja: jeszcze ${player.availability.injuryWeeks} tyg.`);
  if (player.availability.suspendedMatches > 0) reasons.unshift("zawieszenie za kartki");
  const predictedMinute = role === "bench" ? Math.round(72 - squad.coach.rotation * .22 - Math.max(0, score - 45) * .12) : role === "starter" ? 0 : null;
  return { role, positionRank, score: Math.round(score * 10) / 10, reasons, competitors: competitors.slice(0, 5), predictedMinute };
}

export function advanceSquadWeek(squad: ClubSquadState, seed: number): ClubSquadState {
  let state = hashSeed(`${seed}-${squad.clubId}-week`);
  const members = squad.members.map((member) => {
    const formRoll = nextRandom(state); state = formRoll.state;
    const injuryRoll = nextRandom(state); state = injuryRoll.state;
    const cardRoll = nextRandom(state); state = cardRoll.state;
    const injuryWeeks = member.injuryWeeks > 0 ? member.injuryWeeks - 1 : injuryRoll.value < .018 ? 1 + Math.floor(formRoll.value * 5) : 0;
    const yellowCards = member.suspendedMatches > 0 ? 0 : member.yellowCards + (cardRoll.value < .1 ? 1 : 0);
    const suspendedMatches = member.suspendedMatches > 0 ? member.suspendedMatches - 1 : yellowCards >= 5 ? 1 : 0;
    return { ...member, form: Math.max(30, Math.min(95, member.form + (formRoll.value - .48) * 8)), fitness: Math.max(45, Math.min(100, member.fitness + 4 - injuryWeeks * 6)), injuryWeeks, yellowCards: suspendedMatches ? 0 : yellowCards, suspendedMatches };
  });
  return { ...squad, members };
}

export function advancePlayerAvailability(availability: PlayerAvailability, seed: number, energy: number, appeared: boolean) {
  const injuryRoll = nextRandom(hashSeed(`${seed}-player-health`));
  const cardRoll = nextRandom(injuryRoll.state);
  let injuryWeeks = Math.max(0, availability.injuryWeeks - 1);
  if (injuryWeeks === 0 && appeared && injuryRoll.value < Math.max(.006, (55 - energy) / 500)) injuryWeeks = 1 + Math.floor(cardRoll.value * 5);
  const yellowCards = availability.suspendedMatches > 0 ? 0 : availability.yellowCards + (appeared && cardRoll.value < .12 ? 1 : 0);
  const suspendedMatches = availability.suspendedMatches > 0 ? availability.suspendedMatches - 1 : yellowCards >= 5 ? 1 : 0;
  return { injuryWeeks, yellowCards: suspendedMatches ? 0 : yellowCards, suspendedMatches, matchSharpness: Math.max(0, Math.min(100, availability.matchSharpness + (appeared ? 6 : -3))) };
}
