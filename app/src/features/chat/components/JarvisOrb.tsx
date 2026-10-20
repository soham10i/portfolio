import { useEffect, useRef } from 'react';

/* JARVIS's mark: a small globe that genuinely turns.
 *
 * Drawn on a canvas at the device's full pixel density, every frame, from a
 * real rotating sphere: meridians and latitude rings are sampled in 3-D,
 * tilted, and projected, with the front half bright and the back half faint.
 * The shaded body, specular highlight and terminator are radial gradients, so
 * the surface is smooth at any size. Every orb on the page shares one
 * requestAnimationFrame loop; rotation speed eases up while JARVIS is active
 * and the globe holds still (drawn once) when motion is off. */

interface Orb { cv: HTMLCanvasElement; size: number; active: boolean; speed: number; angle: number }

const orbs = new Set<Orb>();
let raf = 0;
let last = 0;

const TILT = (-20 * Math.PI) / 180;        // axis lean, in the screen plane
const LEAN = (22 * Math.PI) / 180;         // top tipped toward the viewer
const MERIDIANS = 8;
const LATITUDES = [-60, -30, 0, 30, 60].map((d) => (d * Math.PI) / 180);

const motionOn = () => document.documentElement.dataset.motion !== 'off';

/** Rotate a unit-sphere point by spin, then lean and tilt; returns screen x, y and depth. */
function project(lat: number, lon: number): [number, number, number] {
  const cl = Math.cos(lat);
  const x = cl * Math.cos(lon), y0 = Math.sin(lat), z0 = cl * Math.sin(lon);
  // lean about the x axis (tips the north pole toward the viewer)
  const y = y0 * Math.cos(LEAN) - z0 * Math.sin(LEAN);
  const z = y0 * Math.sin(LEAN) + z0 * Math.cos(LEAN);
  // tilt in the screen plane
  const x2 = x * Math.cos(TILT) - y * Math.sin(TILT);
  const y2 = x * Math.sin(TILT) + y * Math.cos(TILT);
  return [x2, -y2, z];
}

function draw(o: Orb) {
  const { cv } = o;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const W = cv.width, R = W * 0.46, c = W / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, W);

  // body
  const body = ctx.createRadialGradient(c - R * 0.32, c - R * 0.4, R * 0.05, c, c, R * 1.05);
  body.addColorStop(0, '#b8ecff');
  body.addColorStop(0.32, '#5a90ff');
  body.addColorStop(0.68, '#6d4aff');
  body.addColorStop(1, '#170f45');
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  // grid: back half first (faint), then front half (bright)
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.lineCap = 'round';
  const lw = Math.max(1, W / 90);
  for (const front of [false, true]) {
    ctx.strokeStyle = front ? 'rgba(235,248,255,0.62)' : 'rgba(235,248,255,0.14)';
    ctx.lineWidth = front ? lw : lw * 0.8;
    const stroke = (pts: [number, number, number][]) => {
      ctx.beginPath();
      let pen = false;
      for (const [px, py, pz] of pts) {
        if ((pz >= 0) === front) {
          const X = c + px * R, Y = c + py * R;
          if (pen) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); pen = true; }
        } else pen = false;
      }
      ctx.stroke();
    };
    for (let m = 0; m < MERIDIANS; m++) {
      const lon = o.angle + (m / MERIDIANS) * Math.PI * 2;
      const pts: [number, number, number][] = [];
      for (let k = 0; k <= 48; k++) pts.push(project(-Math.PI / 2 + (k / 48) * Math.PI, lon));
      stroke(pts);
    }
    for (const lat of LATITUDES) {
      const pts: [number, number, number][] = [];
      for (let k = 0; k <= 72; k++) pts.push(project(lat, (k / 72) * Math.PI * 2));
      stroke(pts);
    }
  }
  ctx.restore();

  // terminator (lower right) and specular highlight (upper left)
  const shade = ctx.createRadialGradient(c + R * 0.45, c + R * 0.55, R * 0.1, c + R * 0.3, c + R * 0.35, R * 1.2);
  shade.addColorStop(0, 'rgba(4,2,16,0.55)');
  shade.addColorStop(1, 'rgba(4,2,16,0)');
  const shine = ctx.createRadialGradient(c - R * 0.38, c - R * 0.46, 0, c - R * 0.38, c - R * 0.46, R * 0.55);
  shine.addColorStop(0, 'rgba(255,255,255,0.85)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fillStyle = shade; ctx.fill();
  ctx.fillStyle = shine; ctx.fill();

  // rim light
  ctx.lineWidth = Math.max(1, W / 70);
  const rim = ctx.createLinearGradient(c - R, c - R, c + R, c + R);
  rim.addColorStop(0, 'rgba(170,240,255,0.9)');
  rim.addColorStop(1, 'rgba(140,110,255,0.35)');
  ctx.strokeStyle = rim;
  ctx.beginPath();
  ctx.arc(c, c, R - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
}

function tick(now: number) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  const moving = motionOn();
  for (const o of orbs) {
    const target = o.active ? 2.4 : 0.55;           // radians per second
    o.speed += (target - o.speed) * Math.min(1, dt * 3);
    if (moving) o.angle += o.speed * dt;
    draw(o);
  }
  raf = orbs.size && moving ? requestAnimationFrame(tick) : 0;
}

function start() {
  if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
}

/* Motion toggled on again → resume the shared loop. */
if (typeof MutationObserver !== 'undefined') {
  new MutationObserver(() => { if (motionOn() && orbs.size) start(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
}

export default function JarvisOrb({ size, active = false, className = '' }: {
  size: number;
  active?: boolean;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const orb = useRef<Orb | null>(null);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(size * dpr * 1.25);   // a little supersampling for clean lines
    cv.height = cv.width;
    const o: Orb = { cv, size, active: false, speed: 0.55, angle: Math.random() * Math.PI * 2 };
    orb.current = o;
    orbs.add(o);
    draw(o);
    start();
    return () => { orbs.delete(o); orb.current = null; };
  }, [size]);

  useEffect(() => { if (orb.current) orb.current.active = active; }, [active]);

  return (
    <span className={'jarvis-globe ' + className} data-active={active} style={{ width: size, height: size }} aria-hidden>
      <canvas ref={canvas} style={{ width: size, height: size, display: 'block' }} />
    </span>
  );
}
