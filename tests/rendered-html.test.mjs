import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

let vite;
async function gameModule(path) {
  vite ??= await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  return vite.ssrLoadModule(path);
}

test.after(async () => {
  if (vite) await vite.close();
});

test("server renders the actual game shell", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Piłkarz: Na Pełnej/);
  assert.match(html, /Ładujemy szatnię i 384 kluby/);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("world contains 8 countries, 24 leagues and exactly 384 clubs", async () => {
  const { createWorld } = await gameModule("/game/world.ts");
  const world = createWorld(123456);
  assert.equal(world.countries.length, 8);
  assert.equal(Object.keys(world.leagues).length, 24);
  assert.equal(Object.keys(world.clubs).length, 384);
  for (const league of Object.values(world.leagues)) {
    assert.equal(league.clubIds.length, 16);
    assert.equal(league.fixtures.length, 240);
    assert.equal(new Set(league.fixtures.map((fixture) => fixture.round)).size, 30);
    const pairs = new Map();
    for (const fixture of league.fixtures) {
      const pair = [fixture.homeId, fixture.awayId].sort().join("|");
      pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
    }
    assert.equal(pairs.size, 120);
    assert.ok([...pairs.values()].every((count) => count === 2));
  }
});

test("same seed and input create an identical deterministic match", async () => {
  const { createWorld } = await gameModule("/game/world.ts");
  const { createMatch, advanceMatch } = await gameModule("/game/match-engine.ts");
  const world = createWorld(77);
  const club = world.clubs["PL-3-01"];
  const opponent = world.clubs["PL-3-02"];
  const attrs = { technika: 58, strzal: 54, podania: 62, drybling: 57, odbior: 52, szybkosc: 59, sila: 53, kondycja: 61, refleks: 50 };
  const input = { playerName: "Mirek Wolej", playerNumber: 8, position: "Pomocnik", attrs, playerOvr: 57.4, energy: 78, morale: 70, managerTrust: 65, teamStrength: club.strength, playerClub: club, opponent };
  const first = createMatch(input, 9981);
  const second = createMatch(input, 9981);
  assert.deepEqual(first, second);
  assert.deepEqual(advanceMatch(first, 18), advanceMatch(second, 18));
  assert.ok(first.opportunities.length <= 7);
  assert.ok(first.opportunities.every((opportunity) => opportunity.minute >= first.playerStartMinute));
  assert.ok(first.players.every((player) => player.x >= 0 && player.x <= 100 && player.y >= 0 && player.y <= 64));
  assert.ok(first.opportunities.every((opportunity) => opportunity.target.x >= 0 && opportunity.target.x <= 100 && opportunity.target.y >= 0 && opportunity.target.y <= 64));
});

test("engine permits zero opportunities and never exceeds seven", async () => {
  const { createWorld } = await gameModule("/game/world.ts");
  const { createMatch } = await gameModule("/game/match-engine.ts");
  const world = createWorld(9);
  const club = world.clubs["PL-3-01"];
  const opponent = world.clubs["PL-3-02"];
  const attrs = { technika: 48, strzal: 45, podania: 47, drybling: 46, odbior: 44, szybkosc: 48, sila: 45, kondycja: 47, refleks: 46 };
  const counts = [];
  for (let seed = 1; seed <= 120; seed += 1) counts.push(createMatch({ playerName: "Test", playerNumber: 8, position: "Pomocnik", attrs, playerOvr: 47, energy: 58, morale: 55, managerTrust: 42, teamStrength: club.strength, playerClub: club, opponent }, seed).opportunities.length);
  assert.ok(counts.includes(0));
  assert.ok(Math.max(...counts) <= 7);
});

test("quality strongly changes probability but never reaches certainty", async () => {
  const { createWorld } = await gameModule("/game/world.ts");
  const { createMatch, submitAction } = await gameModule("/game/match-engine.ts");
  const world = createWorld(11);
  const club = world.clubs["PL-3-01"];
  const opponent = world.clubs["PL-3-02"];
  const attrs = { technika: 65, strzal: 64, podania: 66, drybling: 63, odbior: 59, szybkosc: 62, sila: 60, kondycja: 64, refleks: 58 };
  let match;
  for (let seed = 1; seed < 100 && !match?.opportunities.length; seed += 1) match = createMatch({ playerName: "Test", playerNumber: 8, position: "Pomocnik", attrs, playerOvr: 63, energy: 82, morale: 75, managerTrust: 80, teamStrength: club.strength, playerClub: club, opponent }, seed);
  const opportunity = match.opportunities[0];
  const ready = { ...match, phase: "opportunity", currentOpportunity: opportunity };
  const excellent = submitAction(ready, opportunity.id, 95).resolved;
  const poor = submitAction(ready, opportunity.id, 18).resolved;
  assert.ok(excellent.chance >= 86 && excellent.chance <= 98.5);
  assert.ok(poor.chance >= 1 && poor.chance <= 22);
  assert.ok(excellent.chance > poor.chance);
});

test("a complete world round advances tables consistently", async () => {
  const { createWorld, advanceWorldWeek } = await gameModule("/game/world.ts");
  const world = createWorld(31337);
  const started = performance.now();
  const advanced = advanceWorldWeek(world, "PL-L3");
  assert.ok(performance.now() - started < 1000);
  assert.equal(advanced.round, 2);
  for (const league of Object.values(advanced.leagues)) {
    assert.equal(league.fixtures.filter((fixture) => fixture.round === 1 && fixture.played).length, 8);
    assert.equal(league.table.reduce((sum, row) => sum + row.played, 0), 16);
  }
});

test("season end archives tables and performs two promotions and relegations", async () => {
  const { createWorld, advanceWorldWeek } = await gameModule("/game/world.ts");
  let world = createWorld(481516);
  const originalTop = new Set(world.leagues["PL-L1"].clubIds);
  for (let round = 1; round <= 30; round += 1) world = advanceWorldWeek(world, "PL-L3");
  assert.equal(world.season, 2);
  assert.equal(world.round, 1);
  assert.equal(world.history.length, 1);
  assert.equal(world.leagues["PL-L1"].clubIds.filter((id) => !originalTop.has(id)).length, 2);
  assert.ok(Object.values(world.leagues).every((league) => league.table.every((row) => row.played === 0)));
  assert.ok(Object.values(world.leagues).every((league) => league.fixtures.length === 240));
});

test("foreign players materialize deterministically only when requested", async () => {
  const { createWorld, materializePlayer } = await gameModule("/game/world.ts");
  const world = createWorld(1337);
  const first = materializePlayer(world, "ES-1-01", 9);
  const second = materializePlayer(world, "ES-1-01", 9);
  assert.deepEqual(first, second);
  assert.equal(first.clubId, "ES-1-01");
  assert.ok(first.ovr >= 25 && first.ovr <= 92);
});

test("coach builds a deterministic squad and explains lineup hierarchy", async () => {
  const { createWorld } = await gameModule("/game/world.ts");
  const { createClubSquad, selectPlayerForMatch } = await gameModule("/game/squad.ts");
  const world = createWorld(2026);
  const squad = createClubSquad(world, "PL-3-01");
  assert.equal(squad.members.length, 23);
  assert.deepEqual(squad, createClubSquad(world, "PL-3-01"));
  const availability = { injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, matchSharpness: 70 };
  const star = selectPlayerForMatch(squad, { position: "Pomocnik", ovr: 92, energy: 90, morale: 90, managerTrust: 90, availability });
  const injured = selectPlayerForMatch(squad, { position: "Pomocnik", ovr: 92, energy: 90, morale: 90, managerTrust: 90, availability: { ...availability, injuryWeeks: 2 } });
  assert.equal(star.role, "starter");
  assert.equal(injured.role, "out");
  assert.ok(star.reasons.length >= 3);
  assert.ok(star.competitors.length > 0);
});

test("microcycle has diminishing returns, three slots and dynamic traits", async () => {
  const { emptyDevelopmentState, selectMicrocycleSession, setDevelopmentIntensity, forecastSession, applyMicrocycle, applySeasonAging } = await gameModule("/game/development.ts");
  const training = { id: "finish", attrs: { strzal: 1, technika: .3 }, energy: -12 };
  const weights = { strzal: .26, technika: .16 };
  let state = emptyDevelopmentState();
  state = selectMicrocycleSession(state, "finish", false);
  state = selectMicrocycleSession(state, "ball", false);
  state = selectMicrocycleSession(state, "recovery", true);
  state = setDevelopmentIntensity(state, "mocny");
  assert.deepEqual(state.plan, { main: "finish", supplementary: "ball", recovery: "recovery", intensity: "mocny" });
  const fresh = forecastSession(state, training, 19, weights, "main");
  const repeated = forecastSession({ ...state, recentSessions: Array(7).fill("finish") }, training, 19, weights, "main");
  assert.ok(fresh.ovrGain > repeated.ovrGain);
  const attrs = { technika: 60, strzal: 60, podania: 60, drybling: 60, odbior: 60, szybkosc: 60, sila: 60, kondycja: 60, refleks: 60 };
  const result = applyMicrocycle({ state: { ...state, recentSessions: Array(6).fill("finish") }, trainings: [training, { id: "ball", attrs: { technika: .8 }, energy: -8 }, { id: "recovery", attrs: { kondycja: .2 }, energy: 20 }], attrs, age: 19, potential: 90, positionWeight: weights, professionalism: 70, facilities: 1 });
  assert.ok(result.state.traits.includes("Łowca pola karnego"));
  const aged = applySeasonAging(attrs, "Napastnik", 34, 90);
  assert.ok(aged.szybkosc < attrs.szybkosc);
});

test("contracts settle money and transfers really change club terms", async () => {
  const { createWorld } = await gameModule("/game/world.ts");
  const { createMarketState, generateTransferOffers, acceptTransfer, settleCareerWeek } = await gameModule("/game/career-market.ts");
  const world = createWorld(8080);
  let market = createMarketState("PL-3-01", 1, 58, 8080);
  market = settleCareerWeek(market, { season: 1, week: 1, appeared: true, goals: 2, rating: 8, won: true });
  assert.ok(market.ledger[0].amountEur > market.contract.weeklySalaryEur);
  for (let seed = 1; seed < 50 && !market.offers.length; seed += 1) market = generateTransferOffers(world, market, { season: 1, week: 15, age: 20, ovr: 58, potential: 84, form: 75, position: "Pomocnik", currentClubId: "PL-3-01" }, seed);
  assert.ok(market.offers.length > 0);
  const offer = market.offers[0];
  const transferred = acceptTransfer(market, offer, 1, 15);
  assert.equal(transferred.contract.clubId, offer.clubId);
  assert.equal(transferred.offers.length, 0);
  assert.ok(transferred.ledger[0].amountEur > 0);
});
