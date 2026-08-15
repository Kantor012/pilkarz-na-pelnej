"use client";

import { useEffect, useRef } from "react";
import type { MatchSimulationState } from "../game/types";
import { ballTransitionDurationMs } from "../game/match-pacing";

type BallPoint = { x: number; y: number };
type Frame = { ball: BallPoint; startedAt: number; minute: number };
type TrailPoint = BallPoint & { opacity: number };

export default function MatchPitch({ match, reducedMotion = false }: { match: MatchSimulationState; reducedMotion?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previous = useRef<Frame>({ ball: match.ball, startedAt: 0, minute: match.minute });
  const next = useRef<Frame>({ ball: match.ball, startedAt: 0, minute: match.minute });
  const trail = useRef<TrailPoint[]>([]);
  const lastTrailSample = useRef(0);

  useEffect(() => {
    previous.current = next.current;
    next.current = { ball: match.ball, startedAt: performance.now(), minute: match.minute };
  }, [match.ball, match.minute]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let animation = 0;

    const draw = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const width = Math.max(320, rect.width);
      const height = Math.max(190, rect.height);
      if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
      }
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);
      const pad = 16;
      const pitchWidth = width - pad * 2;
      const pitchHeight = height - pad * 2;
      const x = (value: number) => pad + (value / 100) * pitchWidth;
      const y = (value: number) => pad + (value / 64) * pitchHeight;

      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#0d6b43");
      gradient.addColorStop(.55, "#0b5939");
      gradient.addColorStop(1, "#07442c");
      context.fillStyle = "#06121a";
      context.fillRect(0, 0, width, height);
      context.fillStyle = gradient;
      context.fillRect(pad, pad, pitchWidth, pitchHeight);
      for (let stripe = 0; stripe < 12; stripe += 1) {
        context.fillStyle = stripe % 2 ? "rgba(255,255,255,.025)" : "rgba(0,0,0,.045)";
        context.fillRect(x(stripe * (100 / 12)), pad, pitchWidth / 12, pitchHeight);
      }

      context.strokeStyle = "rgba(255,255,255,.58)";
      context.lineWidth = 1.35;
      context.strokeRect(pad, pad, pitchWidth, pitchHeight);
      context.beginPath();
      context.moveTo(x(50), pad); context.lineTo(x(50), pad + pitchHeight);
      context.moveTo(x(0), y(14)); context.lineTo(x(16), y(14)); context.lineTo(x(16), y(50)); context.lineTo(x(0), y(50));
      context.moveTo(x(100), y(14)); context.lineTo(x(84), y(14)); context.lineTo(x(84), y(50)); context.lineTo(x(100), y(50));
      context.stroke();
      context.beginPath(); context.arc(x(50), y(32), Math.min(pitchWidth, pitchHeight) * .11, 0, Math.PI * 2); context.stroke();
      context.beginPath(); context.arc(x(50), y(32), 2.2, 0, Math.PI * 2); context.fillStyle = "rgba(255,255,255,.65)"; context.fill();

      const from = previous.current.ball;
      const to = next.current.ball;
      const duration = ballTransitionDurationMs(match.phase, match.speed);
      const rawProgress = reducedMotion ? 1 : Math.min(1, Math.max(0, (now - next.current.startedAt) / duration));
      const progress = .5 - Math.cos(rawProgress * Math.PI) / 2;
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const curve = Math.sin((next.current.minute + from.x + to.y) * .73) * Math.min(10, 2 + distance * .16);
      const control = { x: (from.x + to.x) / 2, y: clampPitchY((from.y + to.y) / 2 + curve) };
      const inv = 1 - progress;
      const ball = {
        x: inv * inv * from.x + 2 * inv * progress * control.x + progress * progress * to.x,
        y: inv * inv * from.y + 2 * inv * progress * control.y + progress * progress * to.y,
      };

      if (match.currentOpportunity) {
        const target = match.currentOpportunity.target;
        context.setLineDash([7, 7]);
        context.strokeStyle = "rgba(255,193,68,.68)";
        context.lineWidth = 1.5;
        context.beginPath(); context.moveTo(x(ball.x), y(ball.y)); context.lineTo(x(target.x), y(target.y)); context.stroke();
        context.setLineDash([]);
        const pulse = reducedMotion ? 1 : 1 + Math.sin(now / 180) * .18;
        context.beginPath(); context.arc(x(target.x), y(target.y), 10 * pulse, 0, Math.PI * 2);
        context.strokeStyle = "rgba(255,193,68,.92)"; context.lineWidth = 2; context.stroke();
      }

      if (!reducedMotion && now - lastTrailSample.current > 24) {
        trail.current.push({ ...ball, opacity: 1 });
        lastTrailSample.current = now;
      }
      trail.current = trail.current.slice(-28).map((point) => ({ ...point, opacity: point.opacity * .9 })).filter((point) => point.opacity > .04);
      trail.current.forEach((point, index) => {
        const radius = 1.2 + (index / Math.max(1, trail.current.length)) * 2.2;
        context.beginPath(); context.arc(x(point.x), y(point.y), radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(255,255,255,${point.opacity * .32})`; context.fill();
      });

      const bx = x(ball.x);
      const by = y(ball.y);
      context.save();
      context.shadowBlur = 24; context.shadowColor = match.possession === "home" ? "#b8ff2e" : "#63a5ff";
      context.beginPath(); context.arc(bx, by, 7.2, 0, Math.PI * 2); context.fillStyle = "#fff"; context.fill();
      context.restore();
      context.beginPath(); context.arc(bx - 1.8, by - 1.7, 2.1, 0, Math.PI * 2); context.fillStyle = "#1b2730"; context.fill();
      context.beginPath(); context.arc(bx + 2.4, by + 1.5, 1.5, 0, Math.PI * 2); context.fillStyle = "#1b2730"; context.fill();

      context.fillStyle = "rgba(4,13,19,.75)"; context.fillRect(pad + 9, pad + 9, 106, 25);
      context.fillStyle = match.possession === "home" ? "#b8ff2e" : "#63a5ff";
      context.font = "800 9px 'Montserrat Variable', sans-serif"; context.textAlign = "left"; context.textBaseline = "middle";
      context.fillText(`PIŁKA • ${match.possession === "home" ? match.playerClub.short : match.opponent.short}`, pad + 17, pad + 22);

      if (!reducedMotion) animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animation);
  }, [match, reducedMotion]);

  return <canvas ref={canvasRef} className="match-pitch" role="img" aria-label={`Płynny widok ruchu piłki. ${match.minute}. minuta, wynik ${match.scoreHome}:${match.scoreAway}.`} />;
}

const clampPitchY = (value: number) => Math.max(2, Math.min(62, value));
