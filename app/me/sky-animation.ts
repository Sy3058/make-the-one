import {design, palette} from '../styles/design-tokens';
import type {Status} from './experience-state';

function withAlpha(hex: string, alpha: number) {
  const value = hex.slice(1);
  return `rgba(${Number.parseInt(value.slice(0, 2), 16)}, ${Number.parseInt(value.slice(2, 4), 16)}, ${Number.parseInt(value.slice(4, 6), 16)}, ${alpha})`;
}

// The first point is both a star in the waiting sky and the meteor's origin.
const origin = {x: 0.22, y: 0.18};
const stars = Array.from({length: design.starCount}, (_, index) => index === 0
  ? origin
  : {x: ((index * 97 + 53) % 211) / 211, y: ((index * 59 + 17) % 223) / 223});

export function animateSky(canvas: HTMLCanvasElement, status: Status, onComplete: () => void, environment: Window = window) {
  const context = canvas.getContext('2d');
  if (!context) {
    if (status === 'falling') onComplete();
    return () => {};
  }
  const motion = environment.matchMedia('(prefers-reduced-motion: reduce)');
  const document = environment.document;
  let width = 0;
  let height = 0;
  let frame = 0;
  let started: number | undefined;
  let finished = false;

  const drawStars = (timestamp = 0) => {
    context.clearRect(0, 0, width, height);
    stars.forEach((star, index) => {
      if (index === 0 && (status === 'falling' || status === 'ready')) return;
      const searching = status === 'loading' && !motion.matches;
      const pulse = searching
        ? ((1 + Math.sin(timestamp / (design.twinkleBaseMs + index % 5 * design.twinkleStepMs) + index * 1.7)) / 2) ** 2 : 1;
      const alpha = (index === 0 ? 0.95 : index % 5 === 0 ? 0.8 : 0.48) * (searching ? 0.15 + 0.85 * pulse : 1);
      const x = star.x * width;
      const y = star.y * height;
      if (index % 8 === 0) {
        const radius = design.starGlowRadius * (0.6 + 0.7 * pulse);
        const glow = context.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, withAlpha(palette.glow, alpha * 0.55));
        glow.addColorStop(0.3, withAlpha(palette.glow, alpha * 0.18));
        glow.addColorStop(1, withAlpha(palette.glow, 0));
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.beginPath();
      context.fillStyle = withAlpha(palette.meteor, alpha);
      const radius = (index === 0 ? 1.8 : index % 7 === 0 ? 1.2 : 0.7) * (searching ? 0.8 + 0.55 * pulse : 1);
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    });
  };

  const cancelFrame = () => {
    if (frame) environment.cancelAnimationFrame(frame);
    frame = 0;
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelFrame();
    drawStars();
    onComplete();
  };

  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(environment.devicePixelRatio || 1, design.maxPixelRatio);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawStars();
  };

  const render = (timestamp: number) => {
    frame = 0;
    if (finished) return;
    drawStars(timestamp);
    if (status === 'loading') {
      frame = environment.requestAnimationFrame(render);
      return;
    }
    if (started === undefined) started = timestamp;
    const progress = Math.min((timestamp - started) / design.meteorDuration, 1);
    const travel = Math.min(progress / 0.82, 1);
    const eased = travel * travel * (2 - travel);
    const headX = width * (origin.x + eased * 0.48);
    const headY = height * (origin.y + eased * 0.54);
    const trail = Math.min(width * 0.25, height * 0.35) * Math.min(travel * 5, 1);
    const tailX = headX - trail * 0.78;
    const tailY = headY - trail * 0.62;
    const fade = progress > 0.82 ? (1 - progress) / 0.18 : 1;

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
    if (progress < 1) frame = environment.requestAnimationFrame(render);
    else finish();
  };

  const resume = () => {
    cancelFrame();
    if (finished) return;
    if (status === 'falling' && (motion.matches || document.hidden)) finish();
    else if (!document.hidden && !motion.matches && (status === 'loading' || status === 'falling')) {
      frame = environment.requestAnimationFrame(render);
    } else drawStars();
  };

  resize();
  environment.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', resume);
  motion.addEventListener('change', resume);
  resume();
  return () => {
    finished = true;
    cancelFrame();
    environment.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', resume);
    motion.removeEventListener('change', resume);
  };
}
