"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight, faArrowsLeftRight, faBed, faBolt, faBullseye, faCalendarDays, faChartLine,
  faCirclePlay, faClock, faCoins, faDumbbell, faFutbol, faGaugeHigh, faGlobeEurope,
  faHand, faHeartPulse, faHouse, faPause, faPlay, faShieldHalved, faStar, faTableList,
  faUser, faUsers, faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import MatchPitch from "./MatchPitch";
import { SaveRepository } from "../game/save-repository";
import {
  advanceMatch, continueAfterAction, createMatch, opportunityChanceRange, roleLabel,
  setMatchSpeed, submitAction,
} from "../game/match-engine";
import {
  createWorld, currentFixtureForClub, findClubByName, recordFixtureResult,
  seedForNewCareer, sortedTable,
} from "../game/world";
import { advanceWorldWeekAsync } from "../game/world-client";
import { advancePlayerAvailability, advanceSquadWeek, createClubSquad, selectPlayerForMatch, type ClubSquadState, type PlayerAvailability } from "../game/squad";
import { applyMicrocycle, applySeasonAging, emptyDevelopmentState, selectMicrocycleSession, setDevelopmentIntensity, type DevelopmentState } from "../game/development";
import { acceptTransfer, createMarketState, generateTransferOffers, settleCareerWeek, sponsorshipDecision, type MarketState, type TransferOffer } from "../game/career-market";
import { advanceCompetitionsWeek, createCompetitions, updateCallUp, type CompetitionsState } from "../game/competitions";
import type {
  AttrKey, Attributes, CountryCode, InteractiveOpportunity, MatchSimulationState,
  Position, SaveGameV3, WorldState,
} from "../game/types";

type View = "home" | "player" | "club" | "training" | "market" | "competitions" | "world";
type Intensity = "lekki" | "normalny" | "mocny";
type Career = {
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
  hiddenTalent: string;
  hiddenRevealed: boolean;
  trainingCount: number;
  totals: { matches: number; goals: number; assists: number; saves: number; rating: number };
  squad?: ClubSquadState;
  availability?: PlayerAvailability;
  development?: DevelopmentState;
  market?: MarketState;
  competitions?: CompetitionsState;
};

const COUNTRY_NAMES: Record<CountryCode, string> = { PL: "Polska", DE: "Niemcy", IT: "Włochy", NL: "Holandia", FR: "Francja", EN: "Anglia", PT: "Portugalia", ES: "Hiszpania" };
const ATTR_LABELS: Record<AttrKey, string> = { technika: "Technika", strzal: "Strzał", podania: "Podania", drybling: "Drybling", odbior: "Odbiór", szybkosc: "Szybkość", sila: "Siła", kondycja: "Kondycja", refleks: "Refleks" };
const WEIGHTS: Record<Position, Partial<Record<AttrKey, number>>> = {
  Napastnik: { strzal: .26, technika: .16, drybling: .16, szybkosc: .14, sila: .1, podania: .07, kondycja: .07, refleks: .04 },
  Pomocnik: { podania: .24, technika: .2, drybling: .15, kondycja: .13, odbior: .09, szybkosc: .07, strzal: .07, sila: .05 },
  Obrońca: { odbior: .27, sila: .2, kondycja: .13, szybkosc: .11, podania: .1, technika: .08, refleks: .06, drybling: .05 },
  Bramkarz: { refleks: .34, technika: .16, podania: .13, sila: .12, kondycja: .09, szybkosc: .07, odbior: .05, drybling: .04 },
};
const ATTR_ICONS = { technika: faFutbol, strzal: faBullseye, podania: faArrowsLeftRight, drybling: faGaugeHigh, odbior: faShieldHalved, szybkosc: faBolt, sila: faDumbbell, kondycja: faHeartPulse, refleks: faHand };
const START_CLUBS = ["LKS Drobny Druk", "Betonowianka Betonów", "KS Chrząszczyżewko", "LKS Paragon", "Orzeł Niedziela", "Naprzód Po Wypłatę", "Turbo Pogoń II"];
const START_LEVELS = [
  { value: 34, label: "Podwórko", potential: 83 }, { value: 42, label: "B-klasowy kozak", potential: 85 },
  { value: 50, label: "Akademia", potential: 87 }, { value: 58, label: "Kadra województwa", potential: 89 },
  { value: 65, label: "Wonderkid", potential: 92 },
];
const STYLES = ["Technik", "Sprinter", "Dyrygent", "Egzekutor", "Walczak", "Profesor"];
const TALENTS = ["Złoty dotyk", "Silnik z diesla", "Skaner boiska", "Instynkt killera", "Pracoholik", "Losowy — odkryj po 3 treningach"];
const TRAININGS: Array<{ id: string; title: string; category: string; copy: string; attrs: Partial<Attributes>; energy: number; icon: typeof faFutbol }> = [
  { id: "ball", title: "Pachołki i fantazja", category: "TECHNIKA", copy: "Sześć pachołków. Ty omijasz siedem.", attrs: { technika: .8, drybling: .7, podania: .25 }, energy: -11, icon: faFutbol },
  { id: "finish", title: "Sto strzałów", category: "ATAK", copy: "Dwa nagrane. Reszta w płot.", attrs: { strzal: 1.05, technika: .35, sila: .25 }, energy: -14, icon: faBullseye },
  { id: "gym", title: "Siłownia bez selfie", category: "FIZYCZNOŚĆ", copy: "Rzadki trening, na którym ćwiczysz.", attrs: { sila: .9, kondycja: .65, szybkosc: .25 }, energy: -16, icon: faDumbbell },
  { id: "tactics", title: "Wideo z trenerem", category: "GŁOWA", copy: "80 minut pauzowania pilota.", attrs: { odbior: .65, podania: .65, refleks: .45 }, energy: -7, icon: faTableList },
  { id: "passing", title: "Radar na dwa kontakty", category: "PODANIA", copy: "Piłka szybciej niż plotki o premii.", attrs: { podania: 1, technika: .35, refleks: .2 }, energy: -10, icon: faArrowsLeftRight },
  { id: "defense", title: "Wślizgi bez przeprosin", category: "OBRONA", copy: "Najpierw piłka. Tak wpisano w planie.", attrs: { odbior: 1, sila: .35, kondycja: .25 }, energy: -13, icon: faShieldHalved },
  { id: "speed", title: "Sprint do autobusu", category: "SZYBKOŚĆ", copy: "Ostatni kurs. Motywacja prawdziwa.", attrs: { szybkosc: 1, kondycja: .45, drybling: .2 }, energy: -15, icon: faBolt },
  { id: "recovery", title: "Rosół i sen", category: "REGENERACJA", copy: "Zatwierdzone przez babcię i fizjo.", attrs: { kondycja: .2 }, energy: 24, icon: faBed },
];
const INTENSITY: Record<Intensity, { label: string; growth: number; cost: number }> = {
  lekki: { label: "LEKKI", growth: .72, cost: .62 }, normalny: { label: "NORMALNY", growth: 1, cost: 1 }, mocny: { label: "MOCNY", growth: 1.34, cost: 1.4 },
};
const DEFAULT_AVAILABILITY: PlayerAvailability = { injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, matchSharpness: 62 };

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
function calculateOvr(position: Position, attrs: Attributes) {
  return Math.round(Object.entries(WEIGHTS[position]).reduce((sum, [key, weight]) => sum + attrs[key as AttrKey] * (weight ?? 0), 0) * 10) / 10;
}
function initialAttributes(position: Position, target: number, style: string): Attributes {
  const attrs: Attributes = { technika: 43, strzal: 39, podania: 41, drybling: 42, odbior: 38, szybkosc: 46, sila: 40, kondycja: 45, refleks: 40 };
  const positionBoosts: Record<Position, Partial<Attributes>> = {
    Napastnik: { strzal: 54, drybling: 49, szybkosc: 51, odbior: 28 }, Pomocnik: { podania: 53, technika: 50, drybling: 48, kondycja: 50 },
    Obrońca: { odbior: 55, sila: 52, kondycja: 49, strzal: 30 }, Bramkarz: { refleks: 57, technika: 45, podania: 46, strzal: 23 },
  };
  Object.assign(attrs, positionBoosts[position]);
  const styleBoosts: Record<string, Partial<Attributes>> = { Technik: { technika: 5, drybling: 4 }, Sprinter: { szybkosc: 6, kondycja: 2 }, Dyrygent: { podania: 6, technika: 2 }, Egzekutor: { strzal: 6, sila: 2 }, Walczak: { odbior: 5, sila: 4 }, Profesor: { refleks: 4, podania: 3, odbior: 3 } };
  Object.entries(styleBoosts[style]).forEach(([key, value]) => { attrs[key as AttrKey] += value ?? 0; });
  const correction = target - calculateOvr(position, attrs);
  (Object.keys(attrs) as AttrKey[]).forEach((key) => { attrs[key] = clamp(attrs[key] + correction, 18, 78); });
  return attrs;
}

function MiniGame({ opportunity, onDone }: { opportunity: InteractiveOpportunity; onDone: (quality: number) => void }) {
  const [phase, setPhase] = useState<"preview" | "play">(opportunity.kind === "choice" || opportunity.kind === "sequence" ? "preview" : "play");
  const [entered, setEntered] = useState<number[]>([]);
  const [reactionReady, setReactionReady] = useState(false);
  const mountedAt = useRef(0);
  const seed = [...opportunity.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const target = seed % 3;
  const sequence = useMemo(() => Array.from({ length: 4 }, (_, index) => (seed + index * 7) % 4), [seed]);
  useEffect(() => { mountedAt.current = performance.now(); }, []);
  useEffect(() => {
    if (phase !== "preview") return;
    const timer = window.setTimeout(() => setPhase("play"), 1100);
    return () => window.clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    if (opportunity.kind !== "reaction") return;
    const delay = 650 + (seed % 900);
    const timer = window.setTimeout(() => { mountedAt.current = performance.now(); setReactionReady(true); }, delay);
    return () => window.clearTimeout(timer);
  }, [opportunity.kind, seed]);

  const clickTiming = () => {
    const cycle = ((performance.now() - mountedAt.current) % 1800) / 1800;
    const cursor = cycle <= .5 ? cycle * 2 : 2 - cycle * 2;
    onDone(clamp(100 - Math.abs(cursor - .5) * 190));
  };
  const enterSequence = (value: number) => {
    const next = [...entered, value];
    setEntered(next);
    const wrong = next.some((item, index) => item !== sequence[index]);
    if (wrong) onDone(Math.max(6, 42 - next.length * 7));
    else if (next.length === sequence.length) onDone(96);
  };
  return <div className="v3-minigame">
    <div className="v3-mini-heading"><span>MINIGRA • {opportunity.actionType.toUpperCase()}</span><strong>{ATTR_LABELS[opportunity.skill]}</strong></div>
    {opportunity.kind === "timing" && <><div className="v3-timing"><i /><b /></div><button onClick={clickTiming}>TERAZ!</button></>}
    {opportunity.kind === "choice" && <div className="v3-choice">{["LEWO", "ŚRODEK", "PRAWO"].map((label, index) => <button key={label} className={phase === "preview" && index === target ? "preview" : ""} disabled={phase === "preview"} onClick={() => onDone(index === target ? 94 : 14)}>{phase === "preview" && index === target ? "CEL" : label}</button>)}</div>}
    {opportunity.kind === "sequence" && <><div className="v3-sequence-preview">{phase === "preview" ? sequence.map((value, index) => <kbd key={index}>{["↑", "→", "↓", "←"][value]}</kbd>) : <span>POWTÓRZ SEKWENCJĘ • {entered.length}/4</span>}</div>{phase === "play" && <div className="v3-choice">{["↑", "→", "↓", "←"].map((label, index) => <button key={label} onClick={() => enterSequence(index)}>{label}</button>)}</div>}</>}
    {opportunity.kind === "reaction" && <button className={reactionReady ? "reaction-ready" : ""} disabled={!reactionReady} onClick={() => onDone(clamp(108 - (performance.now() - mountedAt.current) / 7))}>{reactionReady ? "REAGUJ!" : "CZEKAJ…"}</button>}
  </div>;
}

export default function CareerGame() {
  const [career, setCareer] = useState<Career | null>(null);
  const [world, setWorld] = useState<WorldState | null>(null);
  const [match, setMatch] = useState<MatchSimulationState | null>(null);
  const [seed, setSeed] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("home");
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [simulatingWorld, setSimulatingWorld] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>("normalny");
  const [creator, setCreator] = useState({ name: "Mirek Wolej", age: 18, nationality: "PL" as CountryCode, position: "Pomocnik" as Position, foot: "Prawa" as "Prawa" | "Lewa", ovr: 50, club: START_CLUBS[0], style: "Dyrygent", talent: TALENTS[5] });

  useEffect(() => {
    let alive = true;
    (async () => {
      const save = await SaveRepository.load<Career>();
      if (!alive) return;
      if (save?.version === 3) {
        const savedCareer = save.career;
        setSeed(save.seed); setCareer({ ...savedCareer, squad: savedCareer.squad ?? createClubSquad(save.world, savedCareer.clubId), availability: savedCareer.availability ?? DEFAULT_AVAILABILITY, development: savedCareer.development ?? emptyDevelopmentState(), market: savedCareer.market ?? createMarketState(savedCareer.clubId, savedCareer.season, calculateOvr(savedCareer.player.position, savedCareer.player.attrs), save.seed), competitions: savedCareer.competitions ?? createCompetitions(save.world, savedCareer.nationality, calculateOvr(savedCareer.player.position, savedCareer.player.attrs)) }); setWorld(save.world); setMatch(save.activeMatch);
      } else {
        const legacyText = window.localStorage.getItem("pilkarz-na-pelnej-save-v2");
        if (legacyText) {
          try {
            const legacy = JSON.parse(legacyText) as Record<string, unknown> & { player?: Record<string, unknown> };
            const legacySeed = seedForNewCareer(String(legacy.player?.name ?? "Zawodnik"));
            const legacyWorld = createWorld(legacySeed);
            const club = findClubByName(legacyWorld, String(legacy.player?.club ?? START_CLUBS[0]));
            const migrated: Career = {
              ...(legacy as unknown as Career), age: 18, nationality: "PL", clubId: club.id, leagueId: `${club.country}-L${club.tier}`,
              managerTrust: 50, hiddenTalent: "Losowy", hiddenRevealed: Boolean(legacy.hiddenRevealed), trainingCount: Number(legacy.trainingCount ?? 0), squad: createClubSquad(legacyWorld, club.id), availability: DEFAULT_AVAILABILITY, development: emptyDevelopmentState(), market: createMarketState(club.id, Number(legacy.season ?? 1), calculateOvr((legacy.player?.position ?? "Pomocnik") as Position, legacy.player?.attrs as Attributes), legacySeed), competitions: createCompetitions(legacyWorld, "PL", calculateOvr((legacy.player?.position ?? "Pomocnik") as Position, legacy.player?.attrs as Attributes)),
            };
            setSeed(legacySeed); setCareer(migrated); setWorld(legacyWorld);
          } catch { window.localStorage.removeItem("pilkarz-na-pelnej-save-v2"); }
        }
      }
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!loaded || !career || !world) return;
    const save: SaveGameV3<Career> = { version: 3, seed, savedAt: Date.now(), career, world, activeMatch: match, settings: { engineVersion: "v3", matchSpeed: match?.speed ?? 1, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches } };
    const timer = window.setTimeout(() => void SaveRepository.write(save), 180);
    return () => window.clearTimeout(timer);
  }, [career, loaded, match, seed, world]);

  useEffect(() => {
    if (!match || paused || (match.phase !== "running" && match.phase !== "warning")) return;
    const timer = window.setTimeout(() => setMatch((current) => current ? advanceMatch(current, 1) : current), match.phase === "warning" ? 1250 : 900 / match.speed);
    return () => window.clearTimeout(timer);
  }, [match, paused]);

  useEffect(() => {
    const visibility = () => { if (document.hidden) setPaused(true); };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  const createCareer = () => {
    const careerSeed = seedForNewCareer(creator.name);
    const nextWorld = createWorld(careerSeed);
    const club = findClubByName(nextWorld, creator.club);
    const level = START_LEVELS.find((item) => item.value === creator.ovr)!;
    const nextCareer: Career = {
      player: { name: creator.name.trim() || "Mirek Wolej", position: creator.position, foot: creator.foot, number: creator.position === "Bramkarz" ? 1 : 8, attrs: initialAttributes(creator.position, creator.ovr, creator.style), potential: level.potential, style: creator.style },
      age: creator.age, nationality: creator.nationality, clubId: club.id, leagueId: `${club.country}-L${club.tier}`,
      season: 1, week: 1, energy: 78, morale: 70, managerTrust: 50, money: 800, trainingDone: false,
      hiddenTalent: creator.talent, hiddenRevealed: creator.talent !== TALENTS[5], trainingCount: 0,
      totals: { matches: 0, goals: 0, assists: 0, saves: 0, rating: 0 },
      squad: createClubSquad(nextWorld, club.id), availability: DEFAULT_AVAILABILITY,
      development: emptyDevelopmentState(),
      market: createMarketState(club.id, 1, creator.ovr, careerSeed),
      competitions: createCompetitions(nextWorld, creator.nationality, creator.ovr),
    };
    setSeed(careerSeed); setWorld(nextWorld); setCareer(nextCareer); setView("home");
  };

  const reset = async () => { await SaveRepository.clear(); setCareer(null); setWorld(null); setMatch(null); setReady(false); };

  const startMatch = () => {
    if (!career || !world) return;
    const playerClub = world.clubs[career.clubId];
    const fixture = currentFixtureForClub(world, career.clubId);
    const opponentId = fixture ? (fixture.homeId === career.clubId ? fixture.awayId : fixture.homeId) : world.leagues[career.leagueId].clubIds.find((id) => id !== career.clubId)!;
    const opponent = world.clubs[opponentId];
    const matchSeed = seed + career.season * 10000 + career.week * 101;
    const squad = career.squad ?? createClubSquad(world, career.clubId);
    const selection = selectPlayerForMatch(squad, { position: career.player.position, ovr: calculateOvr(career.player.position, career.player.attrs), energy: career.energy, morale: career.morale, managerTrust: career.managerTrust, availability: career.availability ?? DEFAULT_AVAILABILITY });
    setMatch(createMatch({ playerName: career.player.name, playerNumber: career.player.number, position: career.player.position, attrs: career.player.attrs, playerOvr: calculateOvr(career.player.position, career.player.attrs), energy: career.energy, morale: career.morale, managerTrust: career.managerTrust, teamStrength: playerClub.strength, playerClub, opponent, forcedRole: selection.role }, matchSeed));
    setPaused(false); setReady(false);
  };

  const finishMatch = async () => {
    if (!career || !world || !match) return;
    setSimulatingWorld(true);
    const fixture = currentFixtureForClub(world, career.clubId);
    let scoredWorld = world;
    if (fixture) {
      const [homeGoals, awayGoals] = fixture.homeId === career.clubId ? [match.scoreHome, match.scoreAway] : [match.scoreAway, match.scoreHome];
      scoredWorld = recordFixtureResult(world, fixture.id, homeGoals, awayGoals);
    }
    const advancedWorld = await advanceWorldWeekAsync(scoredWorld, career.leagueId, fixture?.id);
    setWorld(advancedWorld);
    const appeared = match.playerRole !== "out";
    const updatedClub = advancedWorld.clubs[career.clubId];
    const nextSquad = advanceSquadWeek(career.squad ?? createClubSquad(world, career.clubId), seed + career.week);
    const nextAvailability = advancePlayerAvailability(career.availability ?? DEFAULT_AVAILABILITY, seed + career.week, career.energy, appeared);
    const nextAge = career.week === 30 ? career.age + 1 : career.age;
    const agedAttrs = career.week === 30 ? applySeasonAging(career.player.attrs, career.player.position, nextAge, career.player.potential) : career.player.attrs;
    const settledMarket = settleCareerWeek(career.market ?? createMarketState(career.clubId, career.season, match.playerOvr, seed), { season: career.season, week: career.week, appeared, goals: match.stats.goals, rating: match.rating, won: match.scoreHome > match.scoreAway });
    const nextMarket = generateTransferOffers(advancedWorld, sponsorshipDecision(settledMarket), { season: advancedWorld.season, week: career.week === 30 ? 1 : career.week + 1, age: nextAge, ovr: match.playerOvr, potential: career.player.potential, form: (career.energy + career.morale) / 2, position: career.player.position, currentClubId: career.clubId }, seed + career.week);
    const income = nextMarket.ledger[0]?.id !== career.market?.ledger[0]?.id ? nextMarket.ledger[0]?.amountEur ?? 0 : 0;
    const previousCompetitions = career.competitions ?? createCompetitions(world, career.nationality, match.playerOvr);
    const advancedCompetitions = advancedWorld.season !== previousCompetitions.season ? createCompetitions(advancedWorld, career.nationality, match.playerOvr) : advanceCompetitionsWeek(previousCompetitions, advancedWorld, career.week);
    const nextCompetitions = updateCallUp(advancedCompetitions, career.nationality, match.playerOvr, (career.energy + career.morale) / 2, career.totals.matches * 75);
    setCareer({
      ...career, player: { ...career.player, attrs: agedAttrs }, week: career.week === 30 ? 1 : career.week + 1, season: advancedWorld.season, age: nextAge,
      leagueId: `${updatedClub.country}-L${updatedClub.tier}`,
      energy: clamp(career.energy - (appeared ? 16 : 4)), morale: clamp(career.morale + (match.scoreHome > match.scoreAway ? 5 : match.scoreHome < match.scoreAway ? -3 : 1)),
      managerTrust: clamp(career.managerTrust + (match.rating - 6) * 2.2), trainingDone: false,
      squad: nextSquad, availability: nextAvailability,
      market: nextMarket, money: career.money + Math.round(income * 4.3),
      competitions: nextCompetitions,
      totals: { matches: career.totals.matches + (appeared ? 1 : 0), goals: career.totals.goals + match.stats.goals, assists: career.totals.assists + match.stats.assists, saves: career.totals.saves + match.stats.saves, rating: career.totals.rating + (appeared ? match.rating : 0) },
    });
    setMatch(null); setReady(false); setView("home"); setSimulatingWorld(false);
  };

  const takeTransfer = (offer: TransferOffer) => {
    if (!career || !world) return;
    const nextClub = world.clubs[offer.clubId];
    const market = acceptTransfer(career.market ?? createMarketState(career.clubId, career.season, calculateOvr(career.player.position, career.player.attrs), seed), offer, career.season, career.week);
    const signing = market.ledger[0]?.amountEur ?? 0;
    setCareer({ ...career, clubId: nextClub.id, leagueId: `${nextClub.country}-L${nextClub.tier}`, squad: createClubSquad(world, nextClub.id), managerTrust: 50, market, money: career.money + Math.round(signing * 4.3) });
  };

  const chooseTraining = (training: (typeof TRAININGS)[number]) => {
    if (!career || career.trainingDone) return;
    const development = career.development ?? emptyDevelopmentState();
    setCareer({ ...career, development: selectMicrocycleSession(development, training.id, training.id === "recovery") });
  };

  const executeMicrocycle = () => {
    if (!career || !world || career.trainingDone) return;
    const development = career.development ?? emptyDevelopmentState();
    if (!development.plan.main) return;
    const result = applyMicrocycle({ state: development, trainings: TRAININGS, attrs: career.player.attrs, age: career.age, potential: career.player.potential, positionWeight: WEIGHTS[career.player.position], professionalism: career.managerTrust, facilities: world.clubs[career.clubId].facilities });
    const trainingCount = career.trainingCount + [development.plan.main, development.plan.supplementary, development.plan.recovery].filter(Boolean).length;
    setCareer({ ...career, player: { ...career.player, attrs: result.attrs }, development: result.state, trainingDone: true, trainingCount, hiddenRevealed: career.hiddenRevealed || trainingCount >= 3, energy: clamp(career.energy + result.energy), managerTrust: clamp(career.managerTrust + 1 + Math.max(0, result.state.weeklyLoad - 45) / 80) });
  };

  if (!loaded) return <main className="v3-loading"><div className="brand-mark">P:N:P</div><p>Ładujemy szatnię i 384 kluby…</p></main>;

  if (!career || !world) return <main className="v3-creator">
    <section className="v3-creator-hero"><div className="brand-mark">P:N:P</div><p>SZYBKA KARIERA • PEŁNY ŚWIAT • PRAWDZIWE DECYZJE</p><h1>TY USTALASZ,<br /><em>KIM BĘDZIESZ.</em></h1><span>384 fikcyjne kluby. Osiem krajów. Jedna kariera i zdecydowanie za dużo opinii prezesa.</span></section>
    <section className="v3-form"><p className="micro-label">PEŁNA KARTA ZAWODNIKA</p><h2>Podpisz pierwszy kontrakt</h2>
      <label>IMIĘ I NAZWISKO<input value={creator.name} onChange={(event) => setCreator({ ...creator, name: event.target.value })} /></label>
      <div className="v3-form-row"><label>WIEK<select value={creator.age} onChange={(event) => setCreator({ ...creator, age: Number(event.target.value) })}>{[16,17,18,19,20,21,22].map((age) => <option key={age}>{age}</option>)}</select></label><label>NARODOWOŚĆ<select value={creator.nationality} onChange={(event) => setCreator({ ...creator, nationality: event.target.value as CountryCode })}>{Object.entries(COUNTRY_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label></div>
      <div className="v3-form-row"><label>POZYCJA<select value={creator.position} onChange={(event) => setCreator({ ...creator, position: event.target.value as Position })}>{["Napastnik","Pomocnik","Obrońca","Bramkarz"].map((item) => <option key={item}>{item}</option>)}</select></label><label>LEPSZA NOGA<select value={creator.foot} onChange={(event) => setCreator({ ...creator, foot: event.target.value as "Prawa" | "Lewa" })}><option>Prawa</option><option>Lewa</option></select></label></div>
      <label>PIERWSZY KLUB<select value={creator.club} onChange={(event) => setCreator({ ...creator, club: event.target.value })}>{START_CLUBS.map((club) => <option key={club}>{club}</option>)}</select></label>
      <label>STARTOWY OVR<div className="v3-levels">{START_LEVELS.map((level) => <button key={level.value} className={creator.ovr === level.value ? "active" : ""} onClick={() => setCreator({ ...creator, ovr: level.value })}><strong>{level.value}</strong><span>{level.label}</span></button>)}</div></label>
      <div className="v3-form-row"><label>STYL GRY<select value={creator.style} onChange={(event) => setCreator({ ...creator, style: event.target.value })}>{STYLES.map((style) => <option key={style}>{style}</option>)}</select></label><label>TALENT TRENINGOWY<select value={creator.talent} onChange={(event) => setCreator({ ...creator, talent: event.target.value })}>{TALENTS.map((talent) => <option key={talent}>{talent}</option>)}</select></label></div>
      <button className="v3-primary" onClick={createCareer}>PODPISUJĘ I GRAM <FontAwesomeIcon icon={faArrowRight} /></button>
    </section>
  </main>;

  if (match) {
    const opportunity = match.currentOpportunity;
    const chance = opportunity ? opportunityChanceRange(match, opportunity) : null;
    return <main className="v3-match">
      <header className="v3-match-header"><div><div className="brand-mark">P:N:P</div><span>{match.playerClub.name}</span></div><div className="v3-score"><small>{match.minute}′ • {match.phase === "finished" ? "KONIEC" : paused ? "PAUZA" : "NA ŻYWO"}</small><strong>{match.scoreHome}<i>:</i>{match.scoreAway}</strong></div><div><span>{match.opponent.name}</span><button onClick={() => setPaused(!paused)}><FontAwesomeIcon icon={paused ? faPlay : faPause} /></button></div></header>
      <section className="v3-match-grid">
        <aside className="v3-match-sidebar"><p className="micro-label">TWÓJ STATUS</p><h2>{roleLabel(match.playerRole)}</h2><div className="v3-rating"><span>OCENA</span><strong>{match.rating.toFixed(1)}</strong></div><dl><div><dt>Gole</dt><dd>{match.stats.goals}</dd></div><div><dt>Asysty</dt><dd>{match.stats.assists}</dd></div><div><dt>Obrony</dt><dd>{match.stats.saves}</dd></div><div><dt>Odbiory</dt><dd>{match.stats.tackles}</dd></div></dl><p>{match.playerRole === "bench" && match.minute < match.playerStartMinute ? `Trener planuje zmianę około ${match.playerStartMinute}. minuty.` : match.playerRole === "out" ? "Dziś oglądasz z trybun. To też jest prawidłowy wynik kariery." : `Na boisku do około ${match.playerEndMinute}. minuty.`}</p></aside>
        <section className="v3-pitch-stage"><MatchPitch match={match} />
          {match.phase === "warning" && opportunity && <div className="v3-warning"><span>ZA CHWILĘ • {opportunity.minute}′</span><strong>{opportunity.title}</strong><p>{opportunity.prompt} • {ATTR_LABELS[opportunity.skill]} • szansa po dobrym wykonaniu {chance?.[0]}–{chance?.[1]}%</p></div>}
          {match.phase === "opportunity" && opportunity && !ready && <div className="v3-action-overlay"><p className="micro-label">AKCJA INTERAKTYWNA • {opportunity.minute}′</p><h1>{opportunity.title}</h1><p>{opportunity.flavor}</p><div className="v3-action-facts"><span><b>{ATTR_LABELS[opportunity.skill]}</b> kluczowy atrybut</span><span><b>{chance?.[0]}–{chance?.[1]}%</b> po świetnej minigrze</span></div><button className="v3-primary" onClick={() => setReady(true)}><FontAwesomeIcon icon={faCirclePlay} /> JESTEM GOTOWY</button></div>}
          {match.phase === "opportunity" && opportunity && ready && <div className="v3-action-overlay"><h2>{opportunity.prompt}</h2><MiniGame opportunity={opportunity} onDone={(quality) => { setMatch(submitAction(match, opportunity.id, quality)); setReady(false); }} /></div>}
          {match.phase === "resolved" && match.resolved && <div className={`v3-action-overlay v3-result ${match.resolved.success ? "success" : "fail"}`}><p className="micro-label">JAKOŚĆ MINIGRY {match.resolved.quality}/100</p><h1>{match.resolved.success ? "AKCJA UDANA" : "TYM RAZEM NIE WYSZŁO"}</h1><p>{match.resolved.text}</p><div className="v3-exact"><b>Dokładna szansa: {match.resolved.chance}%</b><span>Rzut: {match.resolved.roll}</span></div><small>{match.resolved.factors.join(" • ")}</small><button className="v3-primary" onClick={() => setMatch(continueAfterAction(match))}>GRAMY DALEJ <FontAwesomeIcon icon={faArrowRight} /></button></div>}
          {match.phase === "finished" && <div className="v3-action-overlay"><p className="micro-label">KONIEC MECZU</p><h1>{match.scoreHome > match.scoreAway ? "SZATNIA ŚPIEWA. NIE RÓWNO, ALE GŁOŚNO." : match.scoreHome === match.scoreAway ? "REMIS. KSIĘGOWY ZADOWOLONY." : "PREZES JUŻ SZUKA WINNEGO."}</h1><div className="v3-final-score">{match.scoreHome}:{match.scoreAway}</div><p>{match.stats.attempts} interaktywnych akcji • ocena {match.rating.toFixed(1)}</p><button className="v3-primary" disabled={simulatingWorld} onClick={() => void finishMatch()}>{simulatingWorld ? "ŚWIAT LICZY TABELKI…" : "WRACAM DO KARIERY"}</button></div>}
          <div className="v3-speed"><button onClick={() => setPaused(!paused)}><FontAwesomeIcon icon={paused ? faPlay : faPause} /></button>{([1,2,4] as const).map((speed) => <button key={speed} className={match.speed === speed ? "active" : ""} onClick={() => setMatch(setMatchSpeed(match, speed))}>×{speed}</button>)}</div>
        </section>
        <aside className="v3-commentary"><p className="micro-label">RADIO BOISKOWE</p><h3>Minuta po minucie</h3>{match.events.slice(0, 9).map((event) => <p key={event.id} className={event.type === "goal" ? "goal" : ""}>{event.text}</p>)}</aside>
      </section>
    </main>;
  }

  const playerClub = world.clubs[career.clubId];
  const playerOvr = calculateOvr(career.player.position, career.player.attrs);
  const fixture = currentFixtureForClub(world, career.clubId);
  const opponent = fixture ? world.clubs[fixture.homeId === career.clubId ? fixture.awayId : fixture.homeId] : null;
  const league = world.leagues[career.leagueId];
  const priorities = (Object.keys(career.player.attrs) as AttrKey[]).sort((a, b) => (WEIGHTS[career.player.position][b] ?? 0) - (WEIGHTS[career.player.position][a] ?? 0)).slice(0, 3);
  const squad = career.squad ?? createClubSquad(world, career.clubId);
  const availability = career.availability ?? DEFAULT_AVAILABILITY;
  const lineupDecision = selectPlayerForMatch(squad, { position: career.player.position, ovr: playerOvr, energy: career.energy, morale: career.morale, managerTrust: career.managerTrust, availability });
  const market = career.market ?? createMarketState(career.clubId, career.season, playerOvr, seed);
  const competitions = career.competitions ?? createCompetitions(world, career.nationality, playerOvr);

  return <main className="v3-career">
    <header className="v3-top"><div className="v3-brand"><div className="brand-mark">P:N:P</div><strong>PIŁKARZ: NA PEŁNEJ</strong></div><div className="v3-season">SEZON {career.season} • TYDZIEŃ {career.week}</div><button onClick={() => void reset()}>NOWA KARIERA</button></header>
    <nav className="v3-nav">{([
      ["home", faHouse, "KARIERA"], ["player", faUser, "ZAWODNIK"], ["club", faUsers, "KLUB"], ["training", faDumbbell, "TRENING"], ["market", faCoins, "RYNEK"], ["competitions", faTrophy, "PUCHARY"], ["world", faGlobeEurope, "ŚWIAT"],
    ] as Array<[View, typeof faHouse, string]>).map(([id, icon, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><FontAwesomeIcon icon={icon} />{label}</button>)}</nav>
    <section className="v3-career-grid">
      <aside className="v3-profile"><div className="v3-shirt">{career.player.number}<small>{playerClub.short}</small></div><p className="micro-label">{career.player.position} • {career.player.foot} noga • {career.player.style}</p><h1>{career.player.name}</h1><span>{career.age} lat • {COUNTRY_NAMES[career.nationality]}</span><p>{playerClub.name}<small>{league.name}</small></p><div className="v3-profile-ovr"><span>OVR</span><strong>{playerOvr.toFixed(1)}</strong><small>Potencjał {career.player.potential}</small></div><div className="v3-bars"><label>ENERGIA <b>{Math.round(career.energy)}%</b><i><em style={{ width: `${career.energy}%` }} /></i></label><label>MORALE <b>{Math.round(career.morale)}%</b><i><em style={{ width: `${career.morale}%` }} /></i></label><label>ZAUFANIE TRENERA <b>{Math.round(career.managerTrust)}%</b><i><em style={{ width: `${career.managerTrust}%` }} /></i></label></div><div className="v3-availability"><span>{availability.injuryWeeks > 0 ? `KONTUZJA ${availability.injuryWeeks} TYG.` : availability.suspendedMatches > 0 ? "ZAWIESZONY" : "GOTOWY"}</span><b>{availability.yellowCards}/5 kartek</b><b>rytm {availability.matchSharpness}%</b></div><div className="v3-talent"><FontAwesomeIcon icon={faWandMagicSparkles} /><span>TALENT</span><strong>{career.hiddenRevealed ? career.hiddenTalent : "???"}</strong><small>{career.hiddenRevealed ? "Bonus działa na rozwój." : `${career.trainingCount}/3 treningów do odkrycia`}</small></div></aside>
      <section className="v3-dashboard">
        {view === "home" && <><div className="v3-view-title"><p className="micro-label">CENTRUM KARIERY</p><h2>Jedna decyzja naraz. Resztę liczy świat.</h2></div><section className="v3-hero-card"><div><p className="micro-label">NAJWAŻNIEJSZE TERAZ</p><h3>{career.trainingDone ? "Plan wykonany. Czas sprawdzić decyzję trenera." : "Masz trening przed kolejną kolejką."}</h3><p>{opponent ? `Rywal: ${opponent.name}, siła ${opponent.strength.toFixed(1)}. Występ zależy od OVR, formy i zaufania.` : "Terminarz czeka na kolejną kolejkę."}</p><button onClick={() => setView("training")}>{career.trainingDone ? "ZOBACZ TRENING" : "WYBIERAM TRENING"}</button></div><div className="v3-kpis"><article><FontAwesomeIcon icon={faStar} /><span>OVR</span><strong>{playerOvr.toFixed(1)}</strong></article><article><FontAwesomeIcon icon={faGaugeHigh} /><span>FORMA</span><strong>{Math.round((career.energy + career.morale) / 2)}%</strong></article><article><FontAwesomeIcon icon={faClock} /><span>MECZE</span><strong>{career.totals.matches}</strong></article><article><FontAwesomeIcon icon={faCoins} /><span>KONTO</span><strong>{career.money} zł</strong></article></div></section><section className="v3-engine-note"><FontAwesomeIcon icon={faChartLine} /><div><strong>NOWY SILNIK MECZU</strong><p>90 minut, niezależne gole zespołów, 0–7 okazji gracza, ławka i brak występu. Każda minigra zwraca jakość 0–100.</p></div></section></>}
        {view === "player" && <><div className="v3-view-title"><p className="micro-label">KARTA ZAWODNIKA</p><h2>Co naprawdę buduje OVR {playerOvr.toFixed(1)}?</h2></div><div className="v3-attributes">{(Object.keys(career.player.attrs) as AttrKey[]).map((key) => { const priority = priorities.indexOf(key); return <article key={key} className={priority >= 0 ? `priority p${priority + 1}` : ""}><FontAwesomeIcon icon={ATTR_ICONS[key]} /><div><span>{ATTR_LABELS[key]} {priority >= 0 && <small>P{priority + 1}</small>}</span><strong>{career.player.attrs[key].toFixed(1)}</strong></div><i><b style={{ width: `${career.player.attrs[key]}%` }} /></i><em>{Math.round((WEIGHTS[career.player.position][key] ?? 0) * 100)}% OVR pozycji</em></article>; })}</div></>}
        {view === "club" && <><div className="v3-view-title"><p className="micro-label">SZATNIA • {squad.coach.formation} • {squad.coach.mentality.toUpperCase()}</p><h2>{squad.coach.name} ustala hierarchię.</h2></div><section className="v3-selection"><div className={`v3-selection-status role-${lineupDecision.role}`}><small>PROGNOZA NA MECZ</small><strong>{lineupDecision.role === "starter" ? "PIERWSZY SKŁAD" : lineupDecision.role === "bench" ? `ŁAWKA • WEJŚCIE OK. ${lineupDecision.predictedMinute}′` : "POZA KADRĄ"}</strong><p>{lineupDecision.reasons.join(" • ")}</p></div><div className="v3-coach"><span>TRENER</span><b>{squad.coach.name}</b><small>rygor {squad.coach.strictness}% • rotacja {squad.coach.rotation}%</small></div></section><div className="v3-squad-table"><header><span>ZAWODNIK</span><span>POZ.</span><span>OVR</span><span>FORMA</span><span>ZDROWIE</span><span>ROLA</span></header><div className="you"><span>{career.player.name}</span><span>{career.player.position}</span><b>{playerOvr.toFixed(1)}</b><span>{Math.round((career.energy+career.morale)/2)}</span><span>{availability.injuryWeeks ? `${availability.injuryWeeks} tyg.` : "100%"}</span><strong># {lineupDecision.positionRank}</strong></div>{squad.members.sort((a,b) => b.ovr-a.ovr).map((member) => <div key={member.id}><span>{member.name}</span><span>{member.position}</span><b>{member.ovr.toFixed(1)}</b><span>{Math.round(member.form)}</span><span>{member.injuryWeeks ? `${member.injuryWeeks} tyg.` : `${Math.round(member.fitness)}%`}</span><strong>{member.squadStatus}</strong></div>)}</div></>}
        {view === "player" && <div className="v3-traits"><span>CECHY SPECJALNE</span>{(career.development?.traits.length ? career.development.traits : ["Jeszcze żadnej — zachowania budują profil"]).map((trait) => <b key={trait}>{trait}</b>)}</div>}
        {view === "training" && <>
          <div className="v3-view-title v3-training-title"><div><p className="micro-label">MIKROCYKL TYGODNIA</p><h2>Główny, uzupełniający i regeneracja.</h2></div><div>{(Object.keys(INTENSITY) as Intensity[]).map((key) => <button key={key} className={intensity === key ? "active" : ""} disabled={career.trainingDone} onClick={() => { setIntensity(key); setCareer({ ...career, development: setDevelopmentIntensity(career.development ?? emptyDevelopmentState(), key) }); }}>{INTENSITY[key].label}</button>)}</div></div>
          <div className="v3-cycle-slots"><span><small>GŁÓWNY</small><b>{TRAININGS.find((item) => item.id === career.development?.plan.main)?.title ?? "wybierz"}</b></span><span><small>UZUPEŁNIAJĄCY</small><b>{TRAININGS.find((item) => item.id === career.development?.plan.supplementary)?.title ?? "opcjonalny"}</b></span><span><small>REGENERACJA</small><b>{TRAININGS.find((item) => item.id === career.development?.plan.recovery)?.title ?? "opcjonalna"}</b></span><button disabled={career.trainingDone || !career.development?.plan.main} onClick={executeMicrocycle}>REALIZUJ MIKROCYKL</button></div>
          <div className="v3-trainings">{TRAININGS.map((training) => { const impact = Object.entries(training.attrs).reduce((sum, [key, gain]) => sum + (gain ?? 0) * (WEIGHTS[career.player.position][key as AttrKey] ?? 0), 0) * INTENSITY[intensity].growth; const rank = [...TRAININGS].sort((a,b) => Object.entries(b.attrs).reduce((sum,[key,gain]) => sum+(gain??0)*(WEIGHTS[career.player.position][key as AttrKey]??0),0)-Object.entries(a.attrs).reduce((sum,[key,gain])=>sum+(gain??0)*(WEIGHTS[career.player.position][key as AttrKey]??0),0)).indexOf(training)+1; const plan = career.development?.plan; const slot = plan?.main === training.id ? "GŁÓWNY" : plan?.supplementary === training.id ? "UZUPEŁNIAJĄCY" : plan?.recovery === training.id ? "REGENERACJA" : null; return <button key={training.id} className={slot ? "selected-session" : ""} disabled={career.trainingDone} onClick={() => chooseTraining(training)}><FontAwesomeIcon icon={training.icon} /><div><small>{training.category}</small><strong>{training.title}</strong><p>{training.copy}</p></div><span>+{impact.toFixed(2)} OVR {slot ? <em>{slot}</em> : rank <= 3 && <em>TOP {rank}</em>}</span><footer>{Object.entries(training.attrs).map(([key,gain]) => <b key={key}>+{((gain??0)*INTENSITY[intensity].growth).toFixed(2)} {ATTR_LABELS[key as AttrKey]}</b>)}<i className={training.energy > 0 ? "positive" : "negative"}>{training.energy > 0 ? "+" : ""}{Math.round(training.energy*INTENSITY[intensity].cost)} energii</i></footer></button>; })}</div>
          {career.trainingDone && <div className="v3-done">PLAN ZREALIZOWANY • obciążenie {career.development?.weeklyLoad ?? 0}% • kolejny mikrocykl po meczu</div>}
        </>}
        {view === "market" && <><div className="v3-view-title"><p className="micro-label">KONTRAKT • AGENT • FINANSE</p><h2>{market.agent.name} odbiera telefony. Czasem nawet twoje.</h2></div><section className="v3-contract"><article><span>OBECNY KONTRAKT</span><strong>{playerClub.name}</strong><p>{market.contract.weeklySalaryEur.toLocaleString("pl-PL")} € / tydz. • do sezonu {market.contract.endSeason}<br />rola: {market.contract.promisedRole} • klauzula {market.contract.releaseClauseEur.toLocaleString("pl-PL")} €</p></article><article><span>AGENT</span><strong>{market.agent.name}</strong><p>skuteczność {market.agent.skill}% • prowizja {market.agent.commission}%</p></article><article><span>REPUTACJA</span><strong>{market.reputation.toFixed(1)}</strong><p>sponsorzy: {market.sponsors.length ? market.sponsors.map((item) => item.name).join(", ") : "jeszcze nikt nie dzwoni"}</p></article></section><div className="v3-relations">{Object.entries(market.relations).map(([name,value]) => <span key={name}><small>{name.toUpperCase()}</small><b>{Math.round(value)}%</b><i><em style={{ width: `${value}%` }} /></i></span>)}</div><h3 className="v3-market-heading">OFERTY TRANSFEROWE</h3><div className="v3-offers">{market.offers.length ? market.offers.map((offer) => { const club = world.clubs[offer.clubId]; return <article key={offer.id}><i style={{ background: club.primary }}>{club.short}</i><div><strong>{club.name}</strong><span>{COUNTRY_NAMES[club.country]} • liga {club.tier}</span><p>{offer.salaryEur.toLocaleString("pl-PL")} € / tydz. • {offer.length} sezony • {offer.promisedRole}<br />premia za podpis {offer.signingBonusEur.toLocaleString("pl-PL")} €</p></div><button onClick={() => takeTransfer(offer)}>PODPISUJĘ</button></article>; }) : <p className="v3-empty-offers">Brak ofert. Okna transferowe otwierają się w tygodniach 1, 15–16 i 30.</p>}</div><h3 className="v3-market-heading">OSTATNIE OPERACJE</h3><div className="v3-ledger">{market.ledger.slice(0,6).map((entry) => <p key={entry.id}><span>S{entry.season} • T{entry.week}</span>{entry.label}<b>+{entry.amountEur.toLocaleString("pl-PL")} €</b></p>)}</div></>}
        {view === "competitions" && <><div className="v3-view-title"><p className="micro-label">SEZON {competitions.season} • ROZGRYWKI DODATKOWE</p><h2>Puchary, Europa i telefon z reprezentacji.</h2></div><div className="v3-competition-kpis"><article><span>PUCHAR KRAJU</span><strong>{competitions.cups[playerClub.country].round}</strong><p>{competitions.cups[playerClub.country].winnerId ? `zwycięzca: ${world.clubs[competitions.cups[playerClub.country].winnerId].name}` : `${competitions.cups[playerClub.country].ties.length} par w obecnej rundzie`}</p></article><article><span>EUROPA</span><strong>{competitions.europe.round}</strong><p>{competitions.europe.winnerId ? world.clubs[competitions.europe.winnerId].name : "32 kluby • 8 grup"}</p></article><article><span>REPREZENTACJA {career.nationality}</span><strong>{competitions.nationalTeams.find((team) => team.country === career.nationality)?.calledUp ? "POWOŁANY" : "OBSERWOWANY"}</strong><p>turniej {competitions.internationalTournament.active ? "w tym sezonie" : "w następnym sezonie"}</p></article></div><div className="v3-cup-grid">{Object.values(competitions.cups).map((cup) => <article key={cup.country}><b>{cup.country}</b><div><strong>{COUNTRY_NAMES[cup.country]}</strong><span>{cup.round} • {cup.ties.length} par</span></div><em>{cup.winnerId ? world.clubs[cup.winnerId].short : "—"}</em></article>)}</div><h3 className="v3-market-heading">GRUPY EUROPEJSKIE</h3><div className="v3-europe-groups">{competitions.europe.groups.map((group,index) => <article key={index}><span>GRUPA {String.fromCharCode(65+index)}</span>{group.map((clubId) => <b key={clubId}>{world.clubs[clubId].short} <small>{competitions.europe.groupResults[clubId] ?? 0} pkt</small></b>)}</article>)}</div></>}
        {view === "world" && <><div className="v3-view-title"><p className="micro-label">{COUNTRY_NAMES[playerClub.country]} • {league.name}</p><h2>Świat: 8 krajów, 24 ligi, 384 kluby.</h2></div><div className="v3-world-summary">{world.countries.map((country) => <span key={country.code}><b>{country.code}</b>{country.name}<small>48 klubów</small></span>)}</div><div className="v3-table"><header><span>#</span><span>KLUB</span><span>M</span><span>BR</span><span>PKT</span></header>{sortedTable(league).map((row,index) => <div key={row.clubId} className={row.clubId === career.clubId ? "current" : ""}><span>{index+1}</span><span><i style={{ background: world.clubs[row.clubId].primary }}>{world.clubs[row.clubId].short}</i>{world.clubs[row.clubId].name}</span><span>{row.played}</span><span>{row.goalsFor}:{row.goalsAgainst}</span><strong>{row.points}</strong></div>)}</div></>}
      </section>
      <aside className="v3-next"><p className="micro-label"><FontAwesomeIcon icon={faCalendarDays} /> KOLEJKA {world.round}/30</p>{opponent ? <><div className="v3-versus"><i style={{ background: playerClub.primary }}>{playerClub.short}</i><span>VS</span><i style={{ background: opponent.primary }}>{opponent.short}</i></div><h2>{opponent.name}</h2><p>Siła rywala <strong>{opponent.strength.toFixed(1)}</strong><br />Decyzja trenera: <strong>{lineupDecision.role === "starter" ? "pierwszy skład" : lineupDecision.role === "bench" ? "ławka" : "poza kadrą"}</strong>.</p><div className={`v3-role-preview role-${lineupDecision.role}`}>#{lineupDecision.positionRank} na pozycji • zaufanie {Math.round(career.managerTrust)}%</div><button className="v3-primary" onClick={startMatch}>{career.trainingDone ? "JADĘ NA MECZ" : "GRAM BEZ TRENINGU"} <FontAwesomeIcon icon={faArrowRight} /></button></> : <p>Brak meczu w tej kolejce.</p>}</aside>
    </section>
  </main>;
}
