import { hashSeed } from "./rng";

export interface GameSettings { sound: boolean; reducedMotion: boolean; textMatch: boolean; highContrast: boolean; defaultSpeed: 1 | 2 | 4 }
export interface PersonalSeasonArchive { season: number; clubName: string; leagueName: string; matches: number; goals: number; assists: number; saves: number; averageRating: number; finalOvr: number }
export interface Achievement { id: string; title: string; copy: string; unlockedAt: string }
export interface MetaGameState { settings: GameSettings; tutorialStep: number; seasonArchive: PersonalSeasonArchive[]; achievements: Achievement[]; eventLog: Array<{ id: string; season: number; week: number; title: string; text: string }> }

export const defaultMetaGame = (): MetaGameState => ({ settings: { sound: false, reducedMotion: false, textMatch: false, highContrast: false, defaultSpeed: 1 }, tutorialStep: 0, seasonArchive: [], achievements: [], eventLog: [] });

const ACHIEVEMENTS = [
  { id: "debut", title: "Pierwsza faktura za korki", copy: "Rozegraj pierwszy mecz." },
  { id: "goal", title: "Siatka jest twoja", copy: "Strzel pierwszego gola." },
  { id: "assist", title: "To było podanie", copy: "Zalicz pierwszą asystę." },
  { id: "veteran", title: "Stempel w książeczce", copy: "Rozegraj 50 meczów." },
  { id: "star", title: "Pan Piłkarz", copy: "Osiągnij OVR 75." },
  { id: "rich", title: "Premia jednak wpłynęła", copy: "Zgromadź 100 000 zł." },
  { id: "international", title: "Hymn znam prawie", copy: "Otrzymaj powołanie." },
];

export function updateAchievements(meta: MetaGameState, input: { season: number; week: number; matches: number; goals: number; assists: number; ovr: number; money: number; calledUp: boolean }) {
  const checks: Record<string, boolean> = { debut: input.matches >= 1, goal: input.goals >= 1, assist: input.assists >= 1, veteran: input.matches >= 50, star: input.ovr >= 75, rich: input.money >= 100000, international: input.calledUp };
  const achievements = [...meta.achievements];
  for (const definition of ACHIEVEMENTS) if (checks[definition.id] && !achievements.some((item) => item.id === definition.id)) achievements.push({ ...definition, unlockedAt: `S${input.season} T${input.week}` });
  return { ...meta, achievements };
}

export function addSeasonArchive(meta: MetaGameState, archive: PersonalSeasonArchive) {
  return { ...meta, seasonArchive: [...meta.seasonArchive, archive].slice(-30) };
}

const WEEKLY_EVENTS = [
  ["Kontrola obuwia", "Trener sprawdził korki. Jeden przeszedł, drugi poprosił o adwokata."],
  ["Premia prawie zaksięgowana", "Księgowość potwierdza, że pieniądze istnieją przynajmniej koncepcyjnie."],
  ["Murawa w formie", "Trawa ma 72% gotowości i nie udziela wywiadów."],
  ["Skaut na trybunie", "Przyjechał po ciebie. Usiadł na złym stadionie, ale intencje były dobre."],
  ["Odprawa taktyczna", "Tablica nie zmieściła planu B, więc gramy planem A trochę głośniej."],
];

export function addWeeklyEvent(meta: MetaGameState, season: number, week: number, seed: number) {
  const event = WEEKLY_EVENTS[hashSeed(`${seed}-${season}-${week}-event`) % WEEKLY_EVENTS.length];
  return { ...meta, eventLog: [{ id: `${season}-${week}`, season, week, title: event[0], text: event[1] }, ...meta.eventLog].slice(0, 80) };
}

export function patchSettings(meta: MetaGameState, patch: Partial<GameSettings>) { return { ...meta, settings: { ...meta.settings, ...patch } }; }
