export type Position = "Napastnik" | "Pomocnik" | "Obrońca" | "Bramkarz";

export type AttrKey =
  | "technika"
  | "strzal"
  | "podania"
  | "drybling"
  | "odbior"
  | "szybkosc"
  | "sila"
  | "kondycja"
  | "refleks";

export type Attributes = Record<AttrKey, number>;
export type CountryCode = "PL" | "DE" | "IT" | "NL" | "FR" | "EN" | "PT" | "ES";
export type MatchRole = "starter" | "bench" | "out";
export type MatchPhase = "running" | "warning" | "opportunity" | "resolved" | "finished";
export type GameKind = "timing" | "choice" | "sequence" | "reaction";

export interface ClubProfile {
  id: string;
  country: CountryCode;
  tier: 1 | 2 | 3;
  name: string;
  short: string;
  primary: string;
  secondary: string;
  strength: number;
  reputation: number;
  style: "pressing" | "possession" | "counter" | "direct";
  facilities: number;
}

export interface LeagueTableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface WorldFixture {
  id: string;
  leagueId: string;
  round: number;
  homeId: string;
  awayId: string;
  played: boolean;
  homeGoals?: number;
  awayGoals?: number;
}

export interface LeagueState {
  id: string;
  country: CountryCode;
  tier: 1 | 2 | 3;
  name: string;
  clubIds: string[];
  table: LeagueTableRow[];
  fixtures: WorldFixture[];
}

export interface CountryState {
  code: CountryCode;
  name: string;
  currency: string;
  leagueIds: string[];
}

export interface WorldState {
  version: 1;
  seed: number;
  season: number;
  round: number;
  countries: CountryState[];
  clubs: Record<string, ClubProfile>;
  leagues: Record<string, LeagueState>;
  history?: WorldSeasonArchive[];
}

export interface WorldSeasonArchive {
  season: number;
  leagues: Array<{
    leagueId: string;
    championId: string;
    promotedIds: string[];
    relegatedIds: string[];
    table: LeagueTableRow[];
  }>;
}

export interface GeneratedWorldPlayer {
  id: string;
  clubId: string;
  name: string;
  nationality: CountryCode;
  position: Position;
  age: number;
  ovr: number;
  potential: number;
}

export interface PitchPoint {
  x: number;
  y: number;
}

export interface PitchPlayer extends PitchPoint {
  id: string;
  side: "home" | "away";
  number: number;
  role: string;
  controlled?: boolean;
  highlighted?: boolean;
}

export interface BallState extends PitchPoint {
  ownerId: string | null;
  target: PitchPoint;
}

export interface MatchEvent {
  id: string;
  minute: number;
  type: "kickoff" | "pass" | "turnover" | "shot" | "goal" | "save" | "tackle" | "foul" | "substitution" | "fulltime";
  side: "home" | "away" | "neutral";
  text: string;
}

export type OpportunityEffect = "goal" | "assist" | "save" | "tackle" | "progression";

export interface InteractiveOpportunity {
  id: string;
  minute: number;
  title: string;
  flavor: string;
  prompt: string;
  actionType: string;
  kind: GameKind;
  skill: AttrKey;
  pressure: number;
  opponentOvr: number;
  successEffect: OpportunityEffect;
  failConcedes: boolean;
  target: PitchPoint;
}

export interface ActionResolution {
  opportunityId: string;
  quality: number;
  chance: number;
  roll: number;
  success: boolean;
  text: string;
  factors: string[];
}

export interface MatchStats {
  goals: number;
  assists: number;
  saves: number;
  tackles: number;
  won: number;
  attempts: number;
}

export interface MatchSimulationState {
  version: 1;
  seed: number;
  rngState: number;
  id: string;
  minute: number;
  scoreHome: number;
  scoreAway: number;
  playerSide: "home" | "away";
  playerRole: MatchRole;
  playerStartMinute: number;
  playerEndMinute: number;
  playerOvr: number;
  playerPosition: Position;
  playerAttrs: Attributes;
  playerTraits: string[];
  playerEnergy: number;
  playerMorale: number;
  playerClub: ClubProfile;
  opponent: ClubProfile;
  phase: MatchPhase;
  speed: 1 | 2 | 4;
  possession: "home" | "away";
  zone: number;
  players: PitchPlayer[];
  ball: BallState;
  opportunities: InteractiveOpportunity[];
  opportunityIndex: number;
  currentOpportunity: InteractiveOpportunity | null;
  resolved: ActionResolution | null;
  rating: number;
  stats: MatchStats;
  events: MatchEvent[];
  competitionKind?: "league" | "cup" | "europe" | "national";
  competitionFixtureId?: string;
}

export interface CreateMatchInput {
  playerName: string;
  playerNumber: number;
  position: Position;
  attrs: Attributes;
  playerOvr: number;
  energy: number;
  morale: number;
  managerTrust: number;
  teamStrength: number;
  playerClub: ClubProfile;
  opponent: ClubProfile;
  forcedRole?: MatchRole;
  forcedStartMinute?: number;
  specialTraits?: string[];
}

export interface SaveGameV3<TCareer = unknown> {
  version: 3;
  seed: number;
  savedAt: number;
  career: TCareer;
  world: WorldState;
  activeMatch: MatchSimulationState | null;
  settings: { engineVersion: "v3"; matchSpeed: 1 | 2 | 4; reducedMotion: boolean };
}
