import { useId } from 'react';

export type MascotMood = 'idle' | 'happy' | 'thinking' | 'done' | 'error';

const EYE = '#67e8f9';

function Eyes({ mood }: { mood: MascotMood }) {
  const line = { stroke: EYE, strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  if (mood === 'happy' || mood === 'done') {
    return (
      <g {...line}>
        <path d="M21.5 34.5q3.25-5 6.5 0" />
        <path d="M36 34.5q3.25-5 6.5 0" />
      </g>
    );
  }
  if (mood === 'error') {
    return (
      <g {...line} strokeWidth={2.4}>
        <path d="M22 28.5l5.5 4-5.5 4" />
        <path d="M42 28.5l-5.5 4 5.5 4" />
      </g>
    );
  }
  return (
    <g transform={mood === 'thinking' ? 'translate(0 -2.5)' : undefined}>
      <g className="tva-blink" fill={EYE}>
        <rect x="21.5" y="27.5" width="6.5" height="10" rx="3.25" />
        <rect x="36" y="27.5" width="6.5" height="10" rx="3.25" />
      </g>
    </g>
  );
}

function Mouth({ mood }: { mood: MascotMood }) {
  if (mood === 'thinking') {
    return (
      <g fill={EYE}>
        <circle className="tva-dot" cx="28" cy="42.5" r="1.4" />
        <circle className="tva-dot" cx="32" cy="42.5" r="1.4" />
        <circle className="tva-dot" cx="36" cy="42.5" r="1.4" />
      </g>
    );
  }
  if (mood === 'happy' || mood === 'done') return <path d="M28 40.5q4 5.5 8 0z" fill={EYE} />;
  if (mood === 'error') {
    return <path d="M27.5 43q2.25-1.8 4.5 0t4.5 0" stroke={EYE} strokeWidth={1.8} strokeLinecap="round" fill="none" />;
  }
  return <path d="M29 41.8q3 2.6 6 0" stroke={EYE} strokeWidth={1.8} strokeLinecap="round" fill="none" />;
}

/** 「小T」: Tooools' video assistant — a small robot with a screen face that follows the cursor. */
export function Mascot({
  mood,
  gaze = { x: 0, y: 0 },
  className,
}: {
  mood: MascotMood;
  /** Where the eyes look, each axis in -1..1. */
  gaze?: { x: number; y: number };
  className?: string;
}) {
  const id = useId().replace(/[^\w-]/g, '');
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
        <radialGradient id={`${id}-bulb`} cx="0.35" cy="0.35" r="0.65">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="1" stopColor="#f59e0b" />
        </radialGradient>
      </defs>

      <path d="M32 13V7" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="5.2" r="3.6" fill={`url(#${id}-bulb)`} className={mood === 'thinking' ? 'tva-pulse' : undefined} />

      <rect x="3" y="28" width="6" height="13" rx="3" fill="#818cf8" />
      <rect x="55" y="28" width="6" height="13" rx="3" fill="#818cf8" />
      <rect x="7" y="12" width="50" height="44" rx="18" fill={`url(#${id}-body)`} />
      <path d="M15.5 21q3-5.5 10-6.3" stroke="#fff" strokeOpacity=".5" strokeWidth="2.4" strokeLinecap="round" fill="none" />

      <rect x="13" y="20" width="38" height="28" rx="11" fill="#1e1b4b" stroke="#312e81" />
      <g transform={`translate(${(gaze.x * 2.2).toFixed(2)} ${(gaze.y * 1.6).toFixed(2)})`}>
        <Eyes mood={mood} />
      </g>
      <ellipse cx="18.5" cy="41.5" rx="2.8" ry="1.6" fill="#f472b6" opacity=".8" />
      <ellipse cx="45.5" cy="41.5" rx="2.8" ry="1.6" fill="#f472b6" opacity=".8" />
      <Mouth mood={mood} />

      {mood === 'done' && (
        <path className="tva-twinkle" d="M51 3.5l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z" fill="#fbbf24" />
      )}
      {mood === 'error' && <path d="M55.5 13.5q-2.6 3.6 0 5.6q2.6-2 0-5.6z" fill="#7dd3fc" />}
    </svg>
  );
}
