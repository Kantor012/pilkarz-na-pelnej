"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { InteractiveOpportunity } from "../game/types";

type TimingStage = {
  id: string;
  label: string;
  hint: string;
  target: number;
  width: number;
  duration: number;
  weight: number;
  scale: [string, string, string];
};

type StageResult = { id: string; label: string; score: number; stoppedAt: number };

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const hash = (value: string) => [...value].reduce((sum, char, index) => (sum * 31 + char.charCodeAt(0) + index * 17) >>> 0, 2166136261);
const seeded = (seed: number, index: number) => ((seed >>> (index % 16)) + seed * (index + 11) * 0.000013) % 1;

export function timingPromptForAction(actionType: string) {
  const action = actionType.toLowerCase();
  if (["strzał", "dośrodkowanie"].includes(action)) return "Ustaw siłę, kierunek i podkręcenie";
  if (["główka", "dobitka"].includes(action)) return "Wyczuj moment uderzenia i jego kierunek";
  if (["podanie", "podanie prostopadłe", "wznowienie", "wyprowadzenie", "decyzja"].includes(action)) return "Ustaw tempo, kierunek i siłę zagrania";
  if (action === "drybling") return "Złap rytm kolejnych kontaktów z piłką";
  if (["parada", "rzut karny", "wyjście do piłki"].includes(action)) return "Odczytaj kierunek i zatrzymaj moment parady";
  if (["odbiór", "przechwyt", "krycie"].includes(action)) return "Wyczuj dystans i moment wejścia";
  if (action === "przyjęcie") return "Wyczuj amortyzację i kierunek odejścia";
  return "Zatrzymaj wskaźnik w odpowiednim momencie";
}

function stageSet(opportunity: InteractiveOpportunity): TimingStage[] {
  const seed = hash(opportunity.id + opportunity.actionType);
  const pressure = clamp(opportunity.pressure * 100);
  const timingTarget = (index: number) => 28 + seeded(seed, index) * 44;
  const directionTarget = clamp((opportunity.target.y / 64) * 100, 12, 88);
  const sweetWidth = (bonus = 0) => clamp(20 - pressure * .08 + bonus, 10, 23);
  const make = (id: string, label: string, hint: string, target: number, weight: number, index: number, scale: TimingStage["scale"], bonus = 0): TimingStage => ({
    id, label, hint, target, width: sweetWidth(bonus), duration: 1220 + seeded(seed, index + 7) * 520, weight, scale,
  });
  const moment = (label = "MOMENT KONTAKTU", index = 0, weight = 1) => make("moment", label, "Zatrzymaj wskaźnik w podświetlonej strefie.", timingTarget(index), weight, index, ["ZA WCZEŚNIE", "IDEALNIE", "ZA PÓŹNO"]);
  const direction = (index = 1, weight = 1) => make("direction", "KIERUNEK", "Wskaż miejsce zagrania wyczuciem czasu.", directionTarget, weight, index, ["LEWO", "ŚRODEK", "PRAWO"], 2);
  const power = (index = 2, weight = 1) => make("power", "SIŁA", "Nie za lekko, nie w trzeci rząd trybun.", clamp(54 + opportunity.pressure * 24, 48, 78), weight, index, ["LEKKO", "OPTYMALNIE", "ZA MOCNO"]);
  const curl = (index = 3, weight = 1) => make("curl", "PODKRĘCENIE", "Zatrzymaj rotację w strefie, która omija rywala.", seeded(seed, 9) > .5 ? 70 : 30, weight, index, ["ZEWNĘTRZNA", "PROSTO", "WEWNĘTRZNA"], 1);

  const action = opportunity.actionType.toLowerCase();
  if (["strzał", "dośrodkowanie"].includes(action)) return [power(0, .34), direction(1, .43), curl(2, .23)];
  if (["główka", "dobitka"].includes(action)) return [moment("MOMENT UDERZENIA", 0, .58), direction(1, .42)];
  if (["podanie", "podanie prostopadłe", "wznowienie", "wyprowadzenie", "decyzja"].includes(action)) return [moment("TEMPO ZAGRANIA", 0, .32), direction(1, .43), power(2, .25)];
  if (action === "drybling") return [moment("PIERWSZY KONTAKT", 0, .34), moment("ZMIANA RYTMU", 2, .38), moment("WYJŚCIE ZE ZWODU", 4, .28)];
  if (["parada", "rzut karny", "wyjście do piłki"].includes(action)) return [direction(0, .46), moment("MOMENT PARADY", 2, .54)];
  if (["odbiór", "przechwyt", "krycie"].includes(action)) return [moment("DYSTANS", 0, .38), moment("MOMENT WEJŚCIA", 3, .62)];
  if (action === "przyjęcie") return [moment("AMORTYZACJA", 0, .62), direction(1, .38)];
  return [moment()];
}

export function timingScore(position: number, target: number, width: number) {
  const distance = Math.abs(position - target);
  const sweetRadius = width / 2;
  if (distance <= sweetRadius) return Math.round(80 + 20 * (1 - distance / Math.max(1, sweetRadius)));
  return Math.round(clamp(80 * (1 - (distance - sweetRadius) / Math.max(1, 58 - sweetRadius))));
}

export default function TimingMiniGame({ opportunity, skillLabel, reducedMotion = false, onDone }: {
  opportunity: InteractiveOpportunity;
  skillLabel: string;
  reducedMotion?: boolean;
  onDone: (quality: number) => void;
}) {
  const stages = useMemo(() => stageSet(opportunity), [opportunity]);
  const [stageIndex, setStageIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState<StageResult[]>([]);
  const [locked, setLocked] = useState(false);
  const [finished, setFinished] = useState(false);
  const cursorRef = useRef(0);
  const stageStartedAt = useRef(0);
  const timerRef = useRef<number | null>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const stage = stages[stageIndex];

  useEffect(() => {
    controlRef.current?.focus();
  }, []);

  useEffect(() => {
    if (locked || finished) return;
    stageStartedAt.current = performance.now();
    let frame = 0;
    const phaseOffset = seeded(hash(opportunity.id), stageIndex + 15) * .36;
    const animate = (now: number) => {
      const duration = stage.duration * (reducedMotion ? 1.35 : 1);
      const cycle = ((now - stageStartedAt.current) / duration + phaseOffset) % 1;
      const position = cycle <= .5 ? cycle * 200 : (1 - cycle) * 200;
      cursorRef.current = position;
      setCursor(position);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [finished, locked, opportunity.id, reducedMotion, stage.duration, stageIndex]);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  const stop = () => {
    if (locked || finished) return;
    setLocked(true);
    const stoppedAt = cursorRef.current;
    const result = { id: stage.id, label: stage.label, stoppedAt, score: timingScore(stoppedAt, stage.target, stage.width) };
    const nextResults = [...results, result];
    setResults(nextResults);
    if (stageIndex < stages.length - 1) {
      timerRef.current = window.setTimeout(() => {
        setStageIndex((current) => current + 1);
        setLocked(false);
      }, 520);
      return;
    }
    setFinished(true);
    const weighted = nextResults.reduce((sum, item, index) => sum + item.score * stages[index].weight, 0) / stages.reduce((sum, item) => sum + item.weight, 0);
    const spread = Math.max(...nextResults.map((item) => item.score)) - Math.min(...nextResults.map((item) => item.score));
    const quality = Math.round(clamp(weighted - spread * .06));
    timerRef.current = window.setTimeout(() => onDone(quality), 800);
  };

  return <div className="v3-timing-game">
    <header><span>MINIGRA CZASOWA • {opportunity.actionType.toUpperCase()}</span><strong>{skillLabel}</strong></header>
    <div className="v3-stage-dots">{stages.map((item, index) => <span key={`${item.id}-${index}`} className={index < stageIndex || finished ? "done" : index === stageIndex ? "active" : ""}><b>{index + 1}</b>{item.label}</span>)}</div>
    <div
      ref={controlRef}
      className={`v3-timing-control ${locked ? "locked" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${stage.label}. Kliknij, dotknij albo naciśnij spację, aby zatrzymać wskaźnik.`}
      onPointerDown={(event) => { event.preventDefault(); stop(); }}
      onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); stop(); } }}
    >
      <div className="v3-meter-copy"><span>ETAP {Math.min(stageIndex + 1, stages.length)}/{stages.length}</span><strong>{stage.label}</strong><p>{stage.hint}</p></div>
      <div className="v3-meter-track">
        <i className="danger left" /><i className="good" style={{ left: `${stage.target - stage.width / 2}%`, width: `${stage.width}%` }} /><i className="perfect" style={{ left: `${stage.target - stage.width * .18}%`, width: `${stage.width * .36}%` }} /><i className="danger right" />
        <b className="cursor" style={{ left: `${cursor}%` }} />
      </div>
      <div className="v3-meter-scale"><span>{stage.scale[0]}</span><b>{stage.scale[1]}</b><span>{stage.scale[2]}</span></div>
      <div className="v3-tap-hint">{locked ? <strong>TRAFIENIE {results.at(-1)?.score}/100</strong> : <><strong>KLIKNIJ / DOTKNIJ</strong><span>lub SPACJA</span></>}</div>
    </div>
    <footer aria-live="polite">{results.map((item, index) => <span key={`${item.id}-${index}`}><small>{item.label}</small><b>{item.score}</b></span>)}</footer>
  </div>;
}
