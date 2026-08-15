import { hashSeed, nextRandom, randomInt } from "./rng";
import type { ClubProfile, CountryCode, CountryState, GeneratedWorldPlayer, LeagueState, LeagueTableRow, Position, WorldFixture, WorldSeasonArchive, WorldState } from "./types";

const COUNTRY_CATALOG: Record<CountryCode, { name: string; currency: string; cities: string[]; leagueNames: [string, string, string] }> = {
  PL: { name: "Polska", currency: "zł", cities: ["Betonów", "Paragon", "Chrząszczyżewko", "Niedziela", "Wypłata", "Drobny Druk", "Korek", "Rosół", "Rondo", "Tapeta", "Komis", "Zatorze", "Grill", "Paczkomat", "Wiadukt", "Delegacja"], leagueNames: ["Liga Wielkich Nadziei", "Liga Jeszcze Większych Ambicji", "Liga Ostatniej Szansy"] },
  DE: { name: "Niemcy", currency: "€", cities: ["Bratwurstburg", "Kassenbon", "Nebenstraße", "Pausenhof", "Kellerheim", "Kartoffeln", "Ordnung", "Ausfahrt", "Biergarten", "Drucker", "Feierabend", "Staubsauger", "Wursttal", "Faxgerät", "Schraube", "Handschuh"], leagueNames: ["Bundesliga für Fortgeschrittene", "Zweite Hoffnungsliga", "Dritte Bratwurstklasse"] },
  IT: { name: "Włochy", currency: "€", cities: ["Carbonara", "Parcheggio", "Espresso", "Ragù", "Scontrino", "Rotonda", "Mozzarella", "Semaforo", "Gelateria", "Panchina", "Burocrazia", "Focaccia", "Motorino", "Risotto", "Calzino", "Autogrill"], leagueNames: ["Serie Fantastica", "Serie Quasi Fantastica", "Serie Molto Locale"] },
  NL: { name: "Holandia", currency: "€", cities: ["Fietsendam", "Kassabon", "Tulpenwijk", "Broodje", "Polderveen", "Koffiebrug", "Regenstad", "Kaaskade", "Windmolen", "Slootdorp", "Oranjebos", "Frituur", "Treinstoring", "Dijkzicht", "Marktplaats", "Klompendam"], leagueNames: ["Eredivisie Zonder Gedoe", "Eerste FietsLiga", "Tweede Polderklasse"] },
  FR: { name: "Francja", currency: "€", cities: ["Baguette-sur-Mer", "Rond-Point", "Croissant", "Ticketville", "Fromage", "Métro-Boulot", "Café Noir", "Péage", "Grève", "Moustache", "Bureau", "Escargot", "Parapluie", "Bon Courage", "Camembert", "Voiture"], leagueNames: ["Ligue Magnifique", "Ligue Presque Magnifique", "Championnat du Dimanche"] },
  EN: { name: "Anglia", currency: "£", cities: ["Tea-on-Trent", "Queuechester", "Rainford", "Receipt Town", "Puddingham", "Roundabout", "Kettle United", "Biscuit City", "Offside-on-Sea", "Carpet Albion", "Chipswich", "Umbrella", "Tuesday Rovers", "Marmalade", "Sorryford", "Pub Athletic"], leagueNames: ["Premier-ish League", "Proper Championship", "League of Last Orders"] },
  PT: { name: "Portugalia", currency: "€", cities: ["Pastel", "Portagem", "Cafézinho", "Rotunda", "Talão", "Bacalhau", "Azulejo", "Saudade", "Elétrico", "Chinelo", "Marisqueira", "Garagem", "Varanda", "Fatura", "Petisco", "Miradouro"], leagueNames: ["Liga Muito Grande", "Liga Quase Grande", "Campeonato da Esquina"] },
  ES: { name: "Hiszpania", currency: "€", cities: ["Siestamar", "Ticketón", "Rotonda", "Churros", "Atascópolis", "Tapas del Sol", "Factura", "Sombrilla", "Cafetera", "Jamón", "Terraza", "Persiana", "Gasolinera", "Paellavista", "Mañana", "Aparcamiento"], leagueNames: ["Liga de las Expectativas", "Segunda de los Sueños", "Tercera de la Siesta"] },
};

const COUNTRY_CODES = Object.keys(COUNTRY_CATALOG) as CountryCode[];
const PREFIXES = ["FC", "Atletico", "Real", "Sporting", "Union", "Dynamo", "Lokomotiv", "Racing", "Akademia", "Kolektyw", "Inter", "Victoria", "Olimpia", "Naprzód", "Turbo", "KS"];
const SUFFIXES = ["Bez Presji", "Na Kredyt", "Po Godzinach", "Z Widokiem", "Ostatni Gwizdek", "Do Wypłaty", "Pełny Gaz", "Rezerwy", "Wczorajsza Forma", "Wieczny Remis", "Drugi Skład", "Królowie Autu", "Spokojna Głowa", "Bez Rozgrzewki", "Plan Minimum", "Pełna Lodówka"];
const COLORS = ["#ffb52e", "#5fa8ff", "#ff6f61", "#52d49b", "#c981ff", "#ff8fbd", "#62d8e8", "#efcf55", "#80c76b", "#9a8cff", "#ef855a", "#4cc0a8", "#d5a449", "#6b91dd", "#de6f8f", "#8dbe4f"];
const STYLES: ClubProfile["style"][] = ["pressing", "possession", "counter", "direct"];

const POLISH_LEGACY = [
  "LKS Drobny Druk",
  "Betonowianka Betonów",
  "KS Chrząszczyżewko",
  "LKS Paragon",
  "Orzeł Niedziela",
  "Naprzód Po Wypłatę",
  "Turbo Pogoń II",
];

function clubShort(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
  return words.slice(0, 3).map((word) => word[0]).join("").toUpperCase().slice(0, 3);
}

function generateClub(country: CountryCode, tier: 1 | 2 | 3, index: number, worldSeed: number): ClubProfile {
  const catalog = COUNTRY_CATALOG[country];
  const legacyName = country === "PL" && tier === 3 ? POLISH_LEGACY[index] : undefined;
  const name = legacyName ?? `${PREFIXES[(index + tier * 5) % PREFIXES.length]} ${catalog.cities[index]} ${SUFFIXES[(index * 3 + tier * 7) % SUFFIXES.length]}`;
  const id = `${country}-${tier}-${String(index + 1).padStart(2, "0")}`;
  const noise = (hashSeed(`${worldSeed}-${id}`) % 700) / 100;
  const base = 76 - (tier - 1) * 13;
  const strength = Math.round((base - 4 + noise) * 10) / 10;
  return {
    id,
    country,
    tier,
    name,
    short: clubShort(name),
    primary: COLORS[(index + tier * 3) % COLORS.length],
    secondary: COLORS[(index * 5 + tier * 7 + 3) % COLORS.length],
    strength,
    reputation: Math.round((strength + tier * 2) * 10) / 10,
    style: STYLES[(index + tier) % STYLES.length],
    facilities: Math.round((0.82 + (strength - 40) / 120) * 100) / 100,
  };
}

export function createRoundRobinFixtures(leagueId: string, clubIds: string[]): WorldFixture[] {
  if (clubIds.length % 2 !== 0) throw new Error("Round-robin requires an even number of clubs");
  const rotating = [...clubIds];
  const firstLeg: WorldFixture[] = [];
  const rounds = rotating.length - 1;
  for (let round = 1; round <= rounds; round += 1) {
    for (let pair = 0; pair < rotating.length / 2; pair += 1) {
      const first = rotating[pair];
      const second = rotating[rotating.length - 1 - pair];
      const reverse = (round + pair) % 2 === 0;
      const homeId = reverse ? second : first;
      const awayId = reverse ? first : second;
      firstLeg.push({ id: `${leagueId}-${round}-${pair + 1}`, leagueId, round, homeId, awayId, played: false });
    }
    rotating.splice(1, 0, rotating.pop()!);
  }
  const secondLeg = firstLeg.map((fixture) => ({
    ...fixture,
    id: `${leagueId}-${fixture.round + rounds}-${fixture.id.split("-").at(-1)}`,
    round: fixture.round + rounds,
    homeId: fixture.awayId,
    awayId: fixture.homeId,
  }));
  return [...firstLeg, ...secondLeg];
}

function emptyTable(clubIds: string[]): LeagueTableRow[] {
  return clubIds.map((clubId) => ({ clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }));
}

export function createWorld(seed = Date.now()): WorldState {
  const normalizedSeed = hashSeed(seed);
  const clubs: Record<string, ClubProfile> = {};
  const leagues: Record<string, LeagueState> = {};
  const countries: CountryState[] = COUNTRY_CODES.map((code) => {
    const catalog = COUNTRY_CATALOG[code];
    const leagueIds: string[] = [];
    ([1, 2, 3] as const).forEach((tier) => {
      const leagueId = `${code}-L${tier}`;
      leagueIds.push(leagueId);
      const leagueClubs = Array.from({ length: 16 }, (_, index) => generateClub(code, tier, index, normalizedSeed));
      leagueClubs.forEach((club) => { clubs[club.id] = club; });
      const clubIds = leagueClubs.map((club) => club.id);
      leagues[leagueId] = { id: leagueId, country: code, tier, name: catalog.leagueNames[tier - 1], clubIds, table: emptyTable(clubIds), fixtures: createRoundRobinFixtures(leagueId, clubIds) };
    });
    return { code, name: catalog.name, currency: catalog.currency, leagueIds };
  });
  return { version: 1, seed: normalizedSeed, season: 1, round: 1, countries, clubs, leagues, history: [] };
}

function expectedGoals(home: ClubProfile, away: ClubProfile) {
  const gap = home.strength - away.strength;
  return { home: Math.max(0.35, 1.35 + gap * 0.035), away: Math.max(0.25, 1.05 - gap * 0.03) };
}

function sampleGoals(state: number, expected: number) {
  let cursor = state;
  let goals = 0;
  for (let index = 0; index < 6; index += 1) {
    const next = nextRandom(cursor);
    cursor = next.state;
    if (next.value < expected / 6) goals += 1;
  }
  return { state: cursor, goals };
}

function applyResult(table: LeagueTableRow[], homeId: string, awayId: string, homeGoals: number, awayGoals: number) {
  const home = table.find((row) => row.clubId === homeId)!;
  const away = table.find((row) => row.clubId === awayId)!;
  home.played += 1; away.played += 1;
  home.goalsFor += homeGoals; home.goalsAgainst += awayGoals;
  away.goalsFor += awayGoals; away.goalsAgainst += homeGoals;
  if (homeGoals > awayGoals) { home.won += 1; away.lost += 1; home.points += 3; }
  else if (homeGoals < awayGoals) { away.won += 1; home.lost += 1; away.points += 3; }
  else { home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1; }
}

export function sortedTable(league: LeagueState) {
  return [...league.table].sort((first, second) => second.points - first.points || (second.goalsFor - second.goalsAgainst) - (first.goalsFor - first.goalsAgainst) || second.goalsFor - first.goalsFor);
}

export function advanceWorldWeek(world: WorldState, focusLeagueId: string, excludedFixtureId?: string) {
  const nextWorld: WorldState = structuredClone(world);
  let rngState = hashSeed(`${world.seed}-${world.season}-${world.round}`);
  Object.values(nextWorld.leagues).forEach((league) => {
    const fixtures = league.fixtures.filter((fixture) => fixture.round === world.round && !fixture.played);
    fixtures.forEach((fixture) => {
      if (fixture.id === excludedFixtureId) return;
      const home = nextWorld.clubs[fixture.homeId];
      const away = nextWorld.clubs[fixture.awayId];
      const expected = expectedGoals(home, away);
      const homeResult = sampleGoals(rngState, expected.home + (league.id === focusLeagueId ? 0.08 : 0));
      const awayResult = sampleGoals(homeResult.state, expected.away);
      rngState = awayResult.state;
      fixture.homeGoals = homeResult.goals;
      fixture.awayGoals = awayResult.goals;
      fixture.played = true;
      applyResult(league.table, fixture.homeId, fixture.awayId, homeResult.goals, awayResult.goals);
    });
  });
  if (world.round >= 30) return concludeSeason(nextWorld);
  nextWorld.round = world.round + 1;
  return nextWorld;
}

export function concludeSeason(world: WorldState) {
  const nextWorld: WorldState = structuredClone(world);
  const archive: WorldSeasonArchive = { season: world.season, leagues: [] };
  for (const country of nextWorld.countries) {
    const first = nextWorld.leagues[country.leagueIds[0]];
    const second = nextWorld.leagues[country.leagueIds[1]];
    const third = nextWorld.leagues[country.leagueIds[2]];
    const firstTable = sortedTable(first);
    const secondTable = sortedTable(second);
    const thirdTable = sortedTable(third);
    const firstDown = firstTable.slice(-2).map((row) => row.clubId);
    const secondUp = secondTable.slice(0, 2).map((row) => row.clubId);
    const secondDown = secondTable.slice(-2).map((row) => row.clubId);
    const thirdUp = thirdTable.slice(0, 2).map((row) => row.clubId);
    archive.leagues.push(
      { leagueId: first.id, championId: firstTable[0].clubId, promotedIds: [], relegatedIds: firstDown, table: firstTable },
      { leagueId: second.id, championId: secondTable[0].clubId, promotedIds: secondUp, relegatedIds: secondDown, table: secondTable },
      { leagueId: third.id, championId: thirdTable[0].clubId, promotedIds: thirdUp, relegatedIds: [], table: thirdTable },
    );
    first.clubIds = first.clubIds.filter((id) => !firstDown.includes(id)).concat(secondUp);
    second.clubIds = second.clubIds.filter((id) => !secondUp.includes(id) && !secondDown.includes(id)).concat(firstDown, thirdUp);
    third.clubIds = third.clubIds.filter((id) => !thirdUp.includes(id)).concat(secondDown);
    ([first, second, third] as LeagueState[]).forEach((league, index) => {
      const tier = (index + 1) as 1 | 2 | 3;
      league.clubIds.forEach((clubId) => { nextWorld.clubs[clubId].tier = tier; });
      league.table = emptyTable(league.clubIds);
      league.fixtures = createRoundRobinFixtures(league.id, league.clubIds);
    });
  }
  nextWorld.history = [...(nextWorld.history ?? []), archive].slice(-20);
  nextWorld.season = world.season + 1;
  nextWorld.round = 1;
  return nextWorld;
}

export function recordFixtureResult(world: WorldState, fixtureId: string, homeGoals: number, awayGoals: number) {
  const nextWorld: WorldState = structuredClone(world);
  const league = Object.values(nextWorld.leagues).find((candidate) => candidate.fixtures.some((fixture) => fixture.id === fixtureId));
  const fixture = league?.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!league || !fixture || fixture.played) return nextWorld;
  fixture.homeGoals = homeGoals;
  fixture.awayGoals = awayGoals;
  fixture.played = true;
  applyResult(league.table, fixture.homeId, fixture.awayId, homeGoals, awayGoals);
  return nextWorld;
}

export function findClubByName(world: WorldState, name: string) {
  return Object.values(world.clubs).find((club) => club.name === name) ?? world.clubs["PL-3-01"];
}

export function currentFixtureForClub(world: WorldState, clubId: string) {
  const club = world.clubs[clubId];
  if (!club) return null;
  const league = world.leagues[`${club.country}-L${club.tier}`];
  return league.fixtures.find((fixture) => fixture.round === world.round && (fixture.homeId === clubId || fixture.awayId === clubId)) ?? null;
}

export function seedForNewCareer(name: string) {
  const timePart = Date.now() & 0xfffffff;
  return hashSeed(`${name}-${timePart}`);
}

export function randomClubFromLeague(world: WorldState, leagueId: string, state: number) {
  const league = world.leagues[leagueId];
  const roll = randomInt(state, 0, league.clubIds.length - 1);
  return { state: roll.state, club: world.clubs[league.clubIds[roll.value]] };
}

const FIRST_NAMES: Record<CountryCode, string[]> = {
  PL: ["Mirek", "Kacper", "Wojtek", "Darek", "Bartosz", "Igor"], DE: ["Lukas", "Felix", "Jonas", "Karl", "Emil", "Nico"],
  IT: ["Luca", "Marco", "Enzo", "Paolo", "Dario", "Matteo"], NL: ["Daan", "Sem", "Luuk", "Bram", "Jesse", "Thijs"],
  FR: ["Lucas", "Hugo", "Theo", "Jules", "Noah", "Maxime"], EN: ["Jack", "Harry", "Alfie", "Lewis", "Ben", "Mason"],
  PT: ["Tiago", "Rui", "Joao", "Nuno", "Diogo", "Andre"], ES: ["Pablo", "Hugo", "Iker", "Dani", "Sergio", "Raul"],
};
const LAST_NAMES = ["Paragon", "Korek", "Rondo", "Factura", "Kassabon", "Biscuit", "Rotonda", "Polder", "Baguette", "Bratwurst", "Autobus", "Wiadukt"];
const POSITIONS: Position[] = ["Bramkarz", "Obrońca", "Obrońca", "Obrońca", "Pomocnik", "Pomocnik", "Pomocnik", "Napastnik"];

export function materializePlayer(world: WorldState, clubId: string, slot: number): GeneratedWorldPlayer {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club: ${clubId}`);
  let state = hashSeed(`${world.seed}-${world.season}-${clubId}-${slot}`);
  const first = randomInt(state, 0, FIRST_NAMES[club.country].length - 1); state = first.state;
  const last = randomInt(state, 0, LAST_NAMES.length - 1); state = last.state;
  const age = randomInt(state, 17, 34); state = age.state;
  const variation = nextRandom(state);
  const ovr = Math.round(clampNumber(club.strength - 7 + variation.value * 14, 25, 92) * 10) / 10;
  return {
    id: `${clubId}-P${String(slot + 1).padStart(2, "0")}`,
    clubId,
    name: `${FIRST_NAMES[club.country][first.value]} ${LAST_NAMES[last.value]}`,
    nationality: club.country,
    position: POSITIONS[slot % POSITIONS.length],
    age: age.value,
    ovr,
    potential: Math.round(clampNumber(ovr + Math.max(0, 24 - age.value) * 0.8 + variation.value * 5, ovr, 96)),
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
