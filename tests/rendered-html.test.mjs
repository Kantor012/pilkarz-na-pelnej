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

test("match library covers every promised interactive action family", async () => {
  const { availableActionTypes, availableGameKinds } = await gameModule("/game/match-engine.ts");
  const available = new Set(availableActionTypes());
  for (const action of ["przyjęcie", "podanie", "podanie prostopadłe", "drybling", "dośrodkowanie", "strzał", "główka", "odbiór", "przechwyt", "krycie", "parada", "wyjście do piłki", "wznowienie"]) assert.ok(available.has(action), `missing ${action}`);
  assert.deepEqual(availableGameKinds(), ["timing"]);
});

test("timing minigame rewards stopping inside the visible target", async () => {
  const { timingPromptForAction, timingScore } = await gameModule("/app/TimingMiniGame.tsx");
  assert.equal(timingScore(50, 50, 16), 100);
  assert.ok(timingScore(45, 50, 16) >= 80);
  assert.ok(timingScore(5, 50, 16) < 30);
  assert.match(timingPromptForAction("strzał"), /siłę, kierunek i podkręcenie/);
  assert.match(timingPromptForAction("drybling"), /rytm/);
});

test("normal match pace advances five minutes per second at x1", async () => {
  const { ballTransitionDurationMs, matchMinuteDurationMs, matchMinutesPerSecond } = await gameModule("/game/match-pacing.ts");
  assert.equal(matchMinutesPerSecond(1), 5);
  assert.equal(matchMinutesPerSecond(2), 10);
  assert.equal(matchMinutesPerSecond(4), 20);
  assert.equal(matchMinuteDurationMs("running", 1), 200);
  assert.equal(matchMinuteDurationMs("running", 4), 50);
  assert.equal(ballTransitionDurationMs("running", 1), 200);
  assert.equal(matchMinuteDurationMs("warning", 1), 1250);
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

test("ambient match simulation creates goals and chances for both teams", async () => {
  const { createWorld } = await gameModule("/game/world.ts");
  const { advanceMatch, createMatch } = await gameModule("/game/match-engine.ts");
  const world = createWorld(77);
  const club = world.clubs["PL-3-01"];
  const opponent = world.clubs["PL-3-02"];
  const attrs = { technika: 58, strzal: 54, podania: 62, drybling: 57, odbior: 52, szybkosc: 59, sila: 53, kondycja: 61, refleks: 70 };
  let homeGoals = 0;
  let awayGoals = 0;
  let scoreless = 0;
  let nonGoalShots = 0;
  const samples = 1200;
  for (let seed = 1; seed <= samples; seed += 1) {
    const created = createMatch({ playerName: "Test", playerNumber: 1, position: "Bramkarz", attrs, playerOvr: 60, energy: 78, morale: 70, managerTrust: 65, teamStrength: club.strength, playerClub: club, opponent }, seed);
    const match = advanceMatch({ ...created, opportunities: [] }, 90);
    homeGoals += match.scoreHome;
    awayGoals += match.scoreAway;
    if (match.scoreHome + match.scoreAway === 0) scoreless += 1;
    nonGoalShots += match.events.filter((item) => item.type === "shot").length;
  }
  const averageGoals = (homeGoals + awayGoals) / samples;
  assert.ok(averageGoals >= 2.2 && averageGoals <= 3, `unexpected average goals: ${averageGoals}`);
  assert.ok(homeGoals / samples > 1.1, "the player's team should score independently of player actions");
  assert.ok(awayGoals / samples > 1.1, "the opponent should remain dangerous");
  assert.ok(scoreless / samples < 0.12, "0:0 results should be uncommon");
  assert.ok(nonGoalShots / samples > 12, "the match feed should contain regular chances");
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

test("Monte Carlo 10000 confirms quality and OVR advantage improve outcomes", async () => {
  const { createWorld } = await gameModule("/game/world.ts");
  const { createMatch, submitAction } = await gameModule("/game/match-engine.ts");
  const world = createWorld(5150); const club = world.clubs["PL-3-01"]; const opponent = world.clubs["PL-3-02"];
  const attrs = { technika: 70, strzal: 70, podania: 70, drybling: 70, odbior: 70, szybkosc: 70, sila: 70, kondycja: 70, refleks: 70 };
  let match; for (let seed = 1; seed < 100 && !match?.opportunities.length; seed += 1) match = createMatch({ playerName:"MC",playerNumber:8,position:"Pomocnik",attrs,playerOvr:70,energy:80,morale:75,managerTrust:80,teamStrength:club.strength,playerClub:club,opponent },seed);
  const opportunity = match.opportunities[0]; const ready = { ...match, phase:"opportunity", currentOpportunity:opportunity };
  let excellent = 0; let poor = 0; let advantage = 0; let disadvantage = 0;
  for (let seed = 1; seed <= 10000; seed += 1) {
    const rngState = (seed * 2654435761) >>> 0;
    excellent += submitAction({ ...ready, rngState },opportunity.id,92).resolved.success ? 1 : 0;
    poor += submitAction({ ...ready, rngState },opportunity.id,20).resolved.success ? 1 : 0;
    advantage += submitAction({ ...ready, rngState, playerOvr:82, playerAttrs:{...attrs,podania:84} },opportunity.id,70).resolved.success ? 1 : 0;
    disadvantage += submitAction({ ...ready, rngState, playerOvr:42, playerAttrs:{...attrs,podania:38} },opportunity.id,70).resolved.success ? 1 : 0;
  }
  assert.ok(excellent > poor * 3);
  assert.ok(advantage > disadvantage);
  assert.ok(excellent < 10000);
});

test("full match remains in pitch bounds and JSON reload preserves RNG outcome", async () => {
  const { createWorld } = await gameModule("/game/world.ts");
  const { createMatch, advanceMatch, submitAction, continueAfterAction } = await gameModule("/game/match-engine.ts");
  const world = createWorld(6161); const club = world.clubs["PL-3-01"]; const opponent = world.clubs["PL-3-02"];
  const attrs = { technika: 60, strzal: 60, podania: 60, drybling: 60, odbior: 60, szybkosc: 60, sila: 60, kondycja: 60, refleks: 60 };
  let state = createMatch({ playerName:"Reload",playerNumber:8,position:"Pomocnik",attrs,playerOvr:60,energy:75,morale:70,managerTrust:65,teamStrength:club.strength,playerClub:club,opponent },999);
  let guard = 0;
  while (state.phase !== "finished" && guard < 200) {
    if (state.phase === "opportunity") {
      const restored = JSON.parse(JSON.stringify(state));
      assert.deepEqual(submitAction(state,state.currentOpportunity.id,81), submitAction(restored,restored.currentOpportunity.id,81));
      state = submitAction(state,state.currentOpportunity.id,81);
    } else if (state.phase === "resolved") state = continueAfterAction(state);
    else state = advanceMatch(state,1);
    assert.ok(state.players.every((player) => player.x >= 0 && player.x <= 100 && player.y >= 0 && player.y <= 64));
    if (state.ball.ownerId) assert.equal(state.players.find((player) => player.id === state.ball.ownerId).side,state.possession);
    guard += 1;
  }
  assert.equal(state.phase,"finished");
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

test("development workshop is uncertain, funded and always costs energy", async () => {
  const { DEVELOPMENT_SUPPORT, developmentSupportCost, emptyDevelopmentState, selectMicrocycleSession, setDevelopmentIntensity, setDevelopmentSupport, forecastSession, previewMicrocycle, applyMicrocycle, settleWeeklyRecovery, applySeasonAging } = await gameModule("/game/development.ts");
  const finish = { id: "finish", attrs: { strzal: 1, technika: .3 }, energy: -12 };
  const ball = { id: "ball", attrs: { technika: .8, drybling: .5 }, energy: -8 };
  const trainings = [finish, ball];
  const weights = { strzal: .26, technika: .16, drybling: .16 };
  let state = emptyDevelopmentState();
  state = selectMicrocycleSession(state, "finish", false);
  state = selectMicrocycleSession(state, "ball", false);
  state = setDevelopmentIntensity(state, "mocny");
  state = setDevelopmentSupport(state, "elite");
  assert.deepEqual(state.plan, { main: "finish", supplementary: "ball", recovery: null, intensity: "mocny", support: "elite" });
  const fresh = forecastSession(state, finish, 19, weights, "main");
  const repeated = forecastSession({ ...state, recentSessions: Array(7).fill("finish") }, finish, 19, weights, "main");
  assert.ok(fresh.ovrGain > repeated.ovrGain);
  assert.ok(fresh.range[0] < fresh.range[1]);
  for (const intensity of ["lekki", "normalny", "mocny"]) {
    for (const support of Object.keys(DEVELOPMENT_SUPPORT)) {
      const plan = setDevelopmentSupport(setDevelopmentIntensity(state, intensity), support);
      const preview = previewMicrocycle({ state: plan, trainings, age: 19, positionWeight: weights, weeklySalary:6000 });
      assert.ok(preview.energyDelta < 0, `${intensity}/${support} must end with negative energy`);
    }
  }
  const singleLight = setDevelopmentSupport(setDevelopmentIntensity(selectMicrocycleSession(emptyDevelopmentState(),"ball",false),"lekki"),"elite");
  const singlePreview = previewMicrocycle({ state:singleLight, trainings, age:19, positionWeight:weights, weeklySalary:6000 });
  assert.equal(singlePreview.energyDelta, Math.round(ball.energy * .72) + DEVELOPMENT_SUPPORT.elite.recovery,"one light session must receive the full advertised recovery");
  assert.ok(singlePreview.energyDelta > 0);
  const attrs = { technika: 60, strzal: 60, podania: 60, drybling: 60, odbior: 60, szybkosc: 60, sila: 60, kondycja: 60, refleks: 60 };
  const input = { state: { ...state, recentSessions: Array(6).fill("finish") }, trainings, attrs, age: 19, potential: 90, positionWeight: weights, professionalism: 70, facilities: 1, seed: 5544, funds: 10000, weeklySalary:6000 };
  const result = applyMicrocycle(input);
  const replay = applyMicrocycle(input);
  assert.deepEqual(result, replay);
  assert.equal(result.moneyCost, developmentSupportCost("elite",6000));
  assert.ok(result.energy < 0);
  assert.ok(result.report.bankedProgress > 0);
  assert.ok(result.state.traits.includes("Łowca pola karnego"));
  const noMoney = applyMicrocycle({ ...input, funds: 0 });
  assert.equal(noMoney.moneyCost, 0);
  assert.ok(developmentSupportCost("elite",10000) > developmentSupportCost("elite",3000),"support prices must scale with the contract");
  assert.equal(developmentSupportCost("analysis",6000),1500);
  assert.equal(developmentSupportCost("personal",6000),3600);
  assert.equal(developmentSupportCost("elite",6000),7500,"premium staff should cost 125% of a weekly salary");
  const restedWithClub = settleWeeklyRecovery({ state: setDevelopmentSupport(state,"club"), trainingDone:false, appeared:false, role:"out", funds:10000, weeklySalary:6000 });
  const restedWithPremium = settleWeeklyRecovery({ state, trainingDone:false, appeared:false, role:"out", funds:10000, weeklySalary:6000 });
  assert.ok(restedWithClub.energyDelta > 0, "a player outside the match must recover energy");
  assert.ok(restedWithPremium.energyDelta > restedWithClub.energyDelta, "premium staff must improve a rest week");
  assert.equal(restedWithPremium.moneyCost, developmentSupportCost("elite",6000));
  const premiumStarter = settleWeeklyRecovery({ state, trainingDone:false, appeared:true, role:"starter", funds:10000, weeklySalary:6000 });
  assert.ok(premiumStarter.energyDelta <= 0, "recovery must not create energy after a full match");
  const trainedAndRested = settleWeeklyRecovery({ state, trainingDone:true, appeared:false, role:"out", funds:10000, weeklySalary:6000 });
  assert.ok(trainedAndRested.energyDelta > 0);
  assert.equal(trainedAndRested.moneyCost,0,"support already paid inside a completed microcycle cannot be charged twice");
  const aged = applySeasonAging(attrs, "Napastnik", 34, 90);
  assert.ok(aged.szybkosc < attrs.szybkosc);
});

test("contracts settle money, negotiate safely and loans return to parent club", async () => {
  const { createWorld } = await gameModule("/game/world.ts");
  const { createMarketState, generateTransferOffers, negotiateOffer, acceptTransfer, prepareWeeklyDecision, resolveWeeklyDecision, resolveContractSeason, settleCareerWeek } = await gameModule("/game/career-market.ts");
  const world = createWorld(8080);
  let market = createMarketState("PL-3-01", 1, 58, 8080);
  market = settleCareerWeek(market, { season: 1, week: 1, appeared: true, goals: 2, rating: 8, won: true });
  assert.ok(market.ledger[0].amountEur > market.contract.weeklySalaryEur);
  assert.equal(market.objectives.find((objective) => objective.id === "appearances").progress,1);
  for (let seed = 1; seed < 50 && !market.offers.length; seed += 1) market = generateTransferOffers(world, market, { season: 1, week: 15, age: 20, ovr: 58, potential: 84, form: 75, position: "Pomocnik", currentClubId: "PL-3-01" }, seed);
  assert.ok(market.offers.length > 0);
  const offer = market.offers[0];
  const negotiated = negotiateOffer(market, offer.id);
  assert.ok(negotiated.offers[0].salaryEur > offer.salaryEur);
  const transferred = acceptTransfer(negotiated, negotiated.offers[0], 1, 15);
  assert.equal(transferred.contract.clubId, offer.clubId);
  assert.equal(transferred.offers.length, 0);
  assert.ok(transferred.ledger[0].amountEur > 0);
  const loaned = acceptTransfer(market, { ...offer, kind:"loan", negotiationRound:0 }, 1, 15);
  assert.equal(loaned.contract.loanFromClubId, market.contract.clubId);
  assert.equal(loaned.contract.endSeason, 2);
  const returned = resolveContractSeason(loaned, 2);
  assert.equal(returned.clubId, market.contract.clubId);
  assert.equal(returned.market.contract.loanFromClubId, undefined);
  const legacyOfferMarket = { ...market, offers: [{ ...offer, negotiationRound: undefined }] };
  assert.equal(negotiateOffer(legacyOfferMarket, offer.id).offers[0].negotiationRound, 1);
  const decisionMarket = prepareWeeklyDecision({ ...market, weeklyDecision:null },1,4,8080);
  assert.ok(decisionMarket.weeklyDecision);
  const decision = resolveWeeklyDecision(decisionMarket,decisionMarket.weeklyDecision.options[0].id,1,4);
  assert.equal(decision.market.weeklyDecision,null);
  assert.ok(decision.deltaEur <= 0);
});

test("cups, Europe and national teams use the complete world", async () => {
  const { createWorld } = await gameModule("/game/world.ts");
  const { createCompetitions, advanceCup, advanceCompetitionsWeek, competitionRoundLabel, updateCallUp } = await gameModule("/game/competitions.ts");
  const world = createWorld(9090);
  let competitions = createCompetitions(world, "PL", 72);
  assert.equal(competitionRoundLabel(competitions.cups.PL.round), "RUNDA WSTĘPNA");
  assert.equal(competitionRoundLabel(competitions.europe.round), "FAZA GRUPOWA");
  assert.equal(Object.keys(competitions.cups).length, 8);
  assert.equal(competitions.cups.PL.ties.length, 16);
  assert.equal(competitions.europe.groups.length, 8);
  assert.ok(competitions.europe.groups.every((group) => group.length === 4));
  const round32 = advanceCup(competitions.cups.PL, world);
  assert.equal(round32.round, "round32");
  assert.equal(round32.ties.length, 16);
  competitions = updateCallUp(competitions, "PL", 75, 80, 900);
  assert.equal(competitions.nationalTeams.find((team) => team.country === "PL").calledUp, true);
  let finishedCup = competitions.cups.PL;
  while (finishedCup.round !== "finished") finishedCup = advanceCup(finishedCup, world);
  competitions.cups.PL = finishedCup;
  world.season = 2;
  let nextSeason = createCompetitions(world, "PL", 75, competitions);
  assert.ok(nextSeason.europe.groups.flat().includes(finishedCup.winnerId));
  for (const week of [6,14,18,22,30]) nextSeason = advanceCompetitionsWeek(nextSeason, world, week);
  assert.equal(nextSeason.internationalTournament.phase, "finished");
  assert.ok(nextSeason.internationalTournament.champion);
  const { getPlayerCompetitionFixture, recordPlayerCompetitionResult } = await gameModule("/game/competitions.ts");
  const freshCompetitions = createCompetitions(world, "PL", 60);
  const lowerClub = freshCompetitions.cups.PL.ties[0].homeId;
  const special = getPlayerCompetitionFixture(freshCompetitions, lowerClub, "PL", 3);
  assert.equal(special.kind, "cup");
  const recorded = recordPlayerCompetitionResult(freshCompetitions, special, lowerClub, 2, 1);
  const advancedCupWeek = advanceCompetitionsWeek(recorded, world, 3, lowerClub);
  assert.equal(advancedCupWeek.cups.PL.round, "round32");
  assert.ok(advancedCupWeek.cups.PL.ties.flatMap((tie) => [tie.homeId,tie.awayId]).includes(lowerClub));
  const { getPlayerNationalFixture } = await gameModule("/game/competitions.ts");
  let called = updateCallUp(createCompetitions(world, "PL", 78), "PL", 78, 85, 1200);
  const national = getPlayerNationalFixture(called, "PL", 6);
  assert.equal(national.kind, "national");
  called = recordPlayerCompetitionResult(called, national, "PL", 2, 0);
  called = advanceCompetitionsWeek(called, world, 6, undefined, "PL");
  assert.equal(called.internationalTournament.groupPoints.PL, 3);
});

test("legacy v2 migration preserves player, attributes, talent, money and statistics", async () => {
  const { migrateLegacyCareerV2 } = await gameModule("/game/migrations.ts");
  const attrs = { technika:61,strzal:49,podania:66,drybling:58,odbior:54,szybkosc:60,sila:56,kondycja:62,refleks:75 };
  const migrated = migrateLegacyCareerV2({ player:{ name:"Mirek Wolej",club:"Betonowianka Betonów",position:"Bramkarz",foot:"Lewa",number:1,attrs,potential:92,style:"Profesor" },age:24,nationality:"PL",season:3,week:11,money:2800,hiddenTalent:"Złoty dotyk",hiddenRevealed:true,trainingCount:8,totals:{matches:47,goals:1,assists:3,saves:129,rating:321.4} });
  assert.equal(migrated.career.player.name,"Mirek Wolej");
  assert.deepEqual(migrated.career.player.attrs,attrs);
  assert.equal(migrated.career.hiddenTalent,"Złoty dotyk");
  assert.equal(migrated.career.money,2800);
  assert.deepEqual(migrated.career.totals,{matches:47,goals:1,assists:3,saves:129,rating:321.4});
  assert.equal(migrated.world.clubs[migrated.career.clubId].name,"Betonowianka Betonów");
});

test("five-season balance simulation keeps every league structurally valid", async () => {
  const { createWorld, advanceWorldWeek } = await gameModule("/game/world.ts");
  let world = createWorld(20260815);
  const started = performance.now();
  for (let week = 0; week < 150; week += 1) world = advanceWorldWeek(world, "PL-L3");
  assert.ok(performance.now() - started < 5000);
  assert.equal(world.season,6);
  assert.equal(world.history.length,5);
  for (const league of Object.values(world.leagues)) {
    assert.equal(league.clubIds.length,16);
    assert.equal(new Set(league.clubIds).size,16);
    assert.equal(league.fixtures.length,240);
  }
  assert.equal(new Set(Object.values(world.leagues).flatMap((league) => league.clubIds)).size,384);
});

test("archive, events, settings and achievements persist as deterministic meta state", async () => {
  const { defaultMetaGame, addWeeklyEvent, updateAchievements, addSeasonArchive, patchSettings } = await gameModule("/game/meta-game.ts");
  let meta = defaultMetaGame();
  meta = addWeeklyEvent(meta, 1, 2, 42);
  assert.deepEqual(meta.eventLog[0], addWeeklyEvent(defaultMetaGame(), 1, 2, 42).eventLog[0]);
  meta = updateAchievements(meta, { season: 1, week: 2, matches: 1, goals: 1, assists: 1, ovr: 76, money: 120000, calledUp: true });
  assert.ok(meta.achievements.length >= 6);
  meta = addSeasonArchive(meta, { season: 1, clubName: "Test", leagueName: "Liga", matches: 20, goals: 5, assists: 4, saves: 0, averageRating: 7.1, finalOvr: 70 });
  assert.equal(meta.seasonArchive.length, 1);
  meta = patchSettings(meta, { textMatch: true, reducedMotion: true, defaultSpeed: 4 });
  assert.equal(meta.settings.textMatch, true);
  assert.equal(meta.settings.defaultSpeed, 4);
});

test("optional cloud repository uploads and downloads SaveGameV3 without changing local saves", async () => {
  const { CloudSaveRepository } = await gameModule("/game/cloud-save.ts");
  const originalFetch = globalThis.fetch;
  const calls = [];
  const save = { version:3,seed:42,savedAt:1,career:{ player:"test" },world:{ version:1 },activeMatch:null,settings:{engineVersion:"v3",matchSpeed:1,reducedMotion:false} };
  globalThis.fetch = async (url, init = {}) => { calls.push({url,init}); return init.method === "POST" ? Response.json({ok:true}) : Response.json({save,updatedAt:"now"}); };
  try {
    await CloudSaveRepository.upload(save);
    const downloaded = await CloudSaveRepository.download();
    assert.equal(calls[0].url,"/api/cloud-save");
    assert.equal(calls[0].init.method,"POST");
    assert.deepEqual(downloaded.save,save);
  } finally { globalThis.fetch = originalFetch; }
});
