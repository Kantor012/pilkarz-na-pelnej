"use client";

import { useEffect, useRef } from "react";
import type { MatchSimulationState, PitchPlayer } from "../game/types";

type Frame = { players: PitchPlayer[]; ball: { x: number; y: number }; startedAt: number };

export default function MatchPitch({ match }: { match: MatchSimulationState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previous = useRef<Frame | null>(null);
  const next = useRef<Frame>({ players: match.players, ball: match.ball, startedAt: 0 });

  useEffect(() => {
    previous.current = next.current;
    next.current = { players: match.players, ball: match.ball, startedAt: performance.now() };
  }, [match.players, match.ball]);

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
      const pad = 16;
      const pitchWidth = width - pad * 2;
      const pitchHeight = height - pad * 2;
      const x = (value: number) => pad + (value / 100) * pitchWidth;
      const y = (value: number) => pad + (value / 64) * pitchHeight;

      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#0e6b42");
      gradient.addColorStop(1, "#09492f");
      context.fillStyle = "#07131d";
      context.fillRect(0, 0, width, height);
      context.fillStyle = gradient;
      context.fillRect(pad, pad, pitchWidth, pitchHeight);
      for (let stripe = 0; stripe < 10; stripe += 1) {
        context.fillStyle = stripe % 2 ? "rgba(255,255,255,.025)" : "rgba(0,0,0,.035)";
        context.fillRect(x(stripe * 10), pad, pitchWidth / 10, pitchHeight);
      }
      context.strokeStyle = "rgba(255,255,255,.63)";
      context.lineWidth = 1.5;
      context.strokeRect(pad, pad, pitchWidth, pitchHeight);
      context.beginPath();
      context.moveTo(x(50), pad); context.lineTo(x(50), pad + pitchHeight);
      context.moveTo(x(0), y(14)); context.lineTo(x(16), y(14)); context.lineTo(x(16), y(50)); context.lineTo(x(0), y(50));
      context.moveTo(x(100), y(14)); context.lineTo(x(84), y(14)); context.lineTo(x(84), y(50)); context.lineTo(x(100), y(50));
      context.stroke();
      context.beginPath(); context.arc(x(50), y(32), Math.min(pitchWidth, pitchHeight) * .11, 0, Math.PI * 2); context.stroke();

      const duration = match.phase === "running" ? Math.max(160, 720 / match.speed) : 350;
      const progress = Math.min(1, (now - next.current.startedAt) / duration);
      const fromPlayers = previous.current?.players ?? next.current.players;
      const fromBall = previous.current?.ball ?? next.current.ball;
      const playerAt = (player: PitchPlayer) => fromPlayers.find((item) => item.id === player.id) ?? player;
      const lerp = (from: number, to: number) => from + (to - from) * (progress * progress * (3 - 2 * progress));

      if (match.currentOpportunity) {
        const target = match.currentOpportunity.target;
        context.setLineDash([7, 7]);
        context.strokeStyle = "rgba(255,191,47,.75)";
        context.beginPath();
        context.moveTo(x(match.ball.x), y(match.ball.y)); context.lineTo(x(target.x), y(target.y)); context.stroke();
        context.setLineDash([]);
      }

      for (const player of next.current.players) {
        const from = playerAt(player);
        const px = x(lerp(from.x, player.x));
        const py = y(lerp(from.y, player.y));
        const controlled = player.controlled;
        const highlighted = player.highlighted;
        if (controlled || highlighted) {
          context.beginPath();
          context.arc(px, py, controlled ? 14 : 12, 0, Math.PI * 2);
          context.fillStyle = controlled ? "rgba(184,255,46,.28)" : "rgba(255,191,47,.24)";
          context.fill();
        }
        context.beginPath(); context.arc(px, py, 7.5, 0, Math.PI * 2);
        context.fillStyle = player.side === "home" ? "#b8ff2e" : "#63a5ff";
        context.fill();
        context.strokeStyle = "rgba(3,10,16,.9)"; context.lineWidth = 2; context.stroke();
        context.fillStyle = "#071019"; context.font = "700 8px Arial"; context.textAlign = "center"; context.textBaseline = "middle";
        context.fillText(String(player.number), px, py + .3);
      }

      const bx = x(lerp(fromBall.x, next.current.ball.x));
      const by = y(lerp(fromBall.y, next.current.ball.y));
      context.beginPath(); context.arc(bx, by, 4.2, 0, Math.PI * 2);
      context.shadowBlur = 12; context.shadowColor = "#fff"; context.fillStyle = "#fff"; context.fill(); context.shadowBlur = 0;
      animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animation);
  }, [match]);

  return <canvas ref={canvasRef} className="match-pitch" role="img" aria-label={`Taktyczny widok boiska. ${match.minute}. minuta, wynik ${match.scoreHome}:${match.scoreAway}.`} />;
}
