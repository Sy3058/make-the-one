'use client';

import {useEffect, useRef} from 'react';
import {animateSky} from './sky-animation';
import type {Status} from './experience-state';
import * as styles from './experience.css';

type Props = {status: Status; onComplete: () => void};

export function MeteorSky({status, onComplete}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) return animateSky(canvas, status, () => completeRef.current());
  }, [status]);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}
