import { useEffect, useRef, useState } from 'react';
import { useStory } from '../lib/store';
import type { LidarReplay } from '../three/LidarReplay';

/* The robotics project's cover: a replay of the real teleop_mapping run in
 * maze1 — the recorded 3-D LIDAR cloud (27,612 points) uncovering as the robot
 * drives its recorded trajectory (831 poses). Data in /media/work, built by
 * scripts/build-lidar-asset.py from the run's scene.ply and map.npz.
 *
 * The renderer (three.js) loads lazily when the cover nears the viewport and
 * pauses off-screen; the screenshot `fallback` shows until it is ready, and
 * stays wherever WebGL is unavailable. Motion off shows the finished map. */
export default function LidarCover({ fallback, data = '/media/work/maze1', className = '' }: {
  fallback?: string;
  data?: string;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hud = useRef<HTMLSpanElement>(null);
  const motion = useStory((s) => s.motion);
  const quality = useStory((s) => s.quality);
  const motionRef = useRef(motion);
  const [live, setLive] = useState(false);

  useEffect(() => { motionRef.current = motion; }, [motion]);

  useEffect(() => {
    const el = host.current, cv = canvas.current;
    if (!el || !cv || quality === 0) return;
    let replay: LidarReplay | null = null;
    let raf = 0, lastT = 0, visible = false, disposed = false, hudAcc = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!replay || !visible) { lastT = now; return; }
      const dt = Math.min(0.05, (now - (lastT || now)) / 1000);
      lastT = now;
      replay.frame(dt, motionRef.current);
      if ((hudAcc += dt) > 0.25 && hud.current) {
        hudAcc = 0;
        const s = replay.status();
        hud.current.textContent = motionRef.current
          ? `Replay · maze1 · pose ${s.pose}/${s.poses} · ${s.points.toLocaleString()} pts`
          : 'Recorded LIDAR · maze1 · 27,612 pts';
      }
    };
    const resize = () => replay?.resize(el.clientWidth, el.clientHeight);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!visible || replay) return;
      void import('../three/LidarReplay').then(async ({ LidarReplay: R }) => {
        if (disposed) return;
        try {
          const r = new R(cv, Math.min(window.devicePixelRatio || 1, quality >= 3 ? 2 : 1.5));
          await r.load(data);
          if (disposed) { r.dispose(); return; }
          replay = r;
          resize();
          setLive(true);
        } catch { /* no WebGL or data — the screenshot stays */ }
      });
    }, { rootMargin: '200px' });
    io.observe(el);
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      replay?.dispose();
    };
  }, [quality, data]);

  return (
    <div ref={host} className={'relative overflow-hidden bg-[#05070d] ' + className}>
      {fallback && (
        <img
          src={fallback}
          alt="SLAM mapping run"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
          style={{ opacity: live ? 0 : 1 }}
        />
      )}
      <canvas ref={canvas} className="absolute inset-0 h-full w-full transition-opacity duration-700" style={{ opacity: live ? 1 : 0 }} aria-hidden />
      {live && (
        <span className="mono pointer-events-none absolute bottom-3 left-3 z-[2] flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 !text-[9px] text-white backdrop-blur-md">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#86ff9f]" />
          <span ref={hud}>Recorded LIDAR · maze1</span>
        </span>
      )}
    </div>
  );
}
