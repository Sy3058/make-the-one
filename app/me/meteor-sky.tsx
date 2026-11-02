'use client';

import {useEffect, useRef} from 'react';
import {design, palette} from '../styles/design-tokens';
import * as styles from './experience.css';

type Props = {playKey: number; onComplete: () => void};

function withAlpha(hex: string, alpha: number) {
  const value = hex.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function MeteorSky({playKey, onComplete}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      if (playKey) completeRef.current();
      return;
    }

    let width = 0;
    let height = 0;
    let frame = 0;
    let started: number | undefined;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (frame) cancelAnimationFrame(frame);
      drawStars();
      completeRef.current();
    };

    const drawStars = () => {
      context.clearRect(0, 0, width, height);
      for (let index = 0; index < 36; index++) {
        const x = ((index * 97 + 53) % 101) / 101 * width;
        const y = ((index * 59 + 17) % 103) / 103 * height;
        context.beginPath();
        context.fillStyle = withAlpha(palette.meteor, index % 5 === 0 ? 0.58 : 0.25);
        context.arc(x, y, index % 7 === 0 ? 1.1 : 0.6, 0, Math.PI * 2);
        context.fill();
      }
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, design.maxPixelRatio);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawStars();
    };

    const render = (timestamp: number) => {
      if (started === undefined) started = timestamp;
      const progress = Math.min((timestamp - started) / design.meteorDuration, 1);
      drawStars();

      const travel = Math.min(progress / 0.82, 1);
      const eased = travel * travel * (2 - travel);
      const headX = width * (0.14 + eased * 0.68);
      const headY = height * (0.12 + eased * 0.7);
      const trail = Math.min(width * 0.28, height * 0.9);
      const tailX = headX - trail * 0.78;
      const tailY = headY - trail * 0.62;
      const fade = progress > 0.82 ? (1 - progress) / 0.18 : Math.min(progress * 8, 1);

      if (fade > 0) {
        const beam = context.createLinearGradient(tailX, tailY, headX, headY);
        beam.addColorStop(0, withAlpha(palette.glow, 0));
        beam.addColorStop(0.55, withAlpha(palette.glow, 0.18 * fade));
        beam.addColorStop(1, withAlpha(palette.meteor, 0.92 * fade));
        context.beginPath();
        context.moveTo(headX, headY);
        context.lineTo(tailX - 2, tailY + 2);
        context.lineTo(tailX + 2, tailY - 2);
        context.closePath();
        context.fillStyle = beam;
        context.fill();

        const halo = context.createRadialGradient(headX, headY, 0, headX, headY, 24);
        halo.addColorStop(0, withAlpha(palette.meteor, 0.9 * fade));
        halo.addColorStop(0.18, withAlpha(palette.glow, 0.36 * fade));
        halo.addColorStop(1, withAlpha(palette.glow, 0));
        context.fillStyle = halo;
        context.beginPath();
        context.arc(headX, headY, 24, 0, Math.PI * 2);
        context.fill();

        for (let index = 0; index < design.particleCount; index++) {
          const offset = (index + 1) / (design.particleCount + 1);
          context.fillStyle = withAlpha(palette.glow, (1 - offset) * fade * 0.45);
          context.beginPath();
          context.arc(headX - offset * trail * 0.75, headY - offset * trail * 0.6 + (index % 3 - 1) * 5, 0.6, 0, Math.PI * 2);
          context.fill();
        }
      }

      if (progress < 1) frame = requestAnimationFrame(render);
      else finish();
    };

    resize();
    window.addEventListener('resize', resize);
    const hide = () => {if (document.hidden && playKey) finish();};
    document.addEventListener('visibilitychange', hide);
    if (playKey) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
      else frame = requestAnimationFrame(render);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [playKey]);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}
