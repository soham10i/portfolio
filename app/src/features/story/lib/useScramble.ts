import { useEffect, useState } from 'react';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/_#*';

/* Decodes `text` left to right through random glyphs, like a readout
   settling. Meant for monospace text, where it causes no layout shift.
   With `run` false it returns the text unchanged. */
export function useScramble(text: string, run: boolean, durationMs = 1100) {
  const [out, setOut] = useState(text);

  useEffect(() => {
    if (!run) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const settled = Math.floor(p * text.length);
      setOut(
        text
          .split('')
          .map((ch, i) => (i < settled || ch === ' ' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
          .join(''),
      );
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, run, durationMs]);

  return run ? out : text;
}
