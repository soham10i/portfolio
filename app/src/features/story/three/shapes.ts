/* Morph targets for the background point cloud — one per home chapter, each
 * drawn from the work the chapter is about. Every generator returns exactly
 * N points (xyz interleaved) in roughly a 6-unit cube centred on the origin,
 * so any two can be interpolated point-for-point.
 *
 *   01 Hey      a real LIDAR sweep: beams from a robot hitting maze walls and floor
 *   02 About    a sensor sphere with latitude bands
 *   03 Work     nine cards in a 3×3 grid — the nine projects
 *   04 Lab      the factory cell: aluminium enclosure, base plate, racks
 *   05 Path     a rising timeline curve with a node per role
 *   06 Method   four clusters joined by a stream — model, simulate, deploy, measure
 *   07 Contact  a calm wave field */

type Gen = (n: number, rand: () => number) => Float32Array;

/** Deterministic PRNG (mulberry32), so the cloud is identical on every visit. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const jitter = (rand: () => number, s: number) => (rand() - 0.5) * s;

/* ── 01 LIDAR scan ───────────────────────────────────────────────────────── */

// Maze walls in the floor plane (x, z), as segments [x1, z1, x2, z2].
const WALLS: number[][] = [
  [-3, -2.2, 3, -2.2], [3, -2.2, 3, 2.2], [3, 2.2, -3, 2.2], [-3, 2.2, -3, -2.2],
  [-1.6, -2.2, -1.6, -0.6], [-1.6, 0.6, -0.4, 0.6], [0.6, -1.2, 0.6, 0.2],
  [0.6, 0.2, 1.8, 0.2], [1.8, 1.0, 1.8, 2.2], [-0.6, 1.4, 0.8, 1.4], [-2.4, 0.2, -2.4, 1.2],
];
const FLOOR = -0.9;   // sensor sits 0.9 above the floor
const WALL_TOP = 0.7;

function rayHit(ax: number, az: number): number {
  let best = Infinity;
  for (const [x1, z1, x2, z2] of WALLS) {
    const ex = x2 - x1, ez = z2 - z1;
    const den = ax * ez - az * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (x1 * ez - z1 * ex) / den;          // distance along the ray
    const u = (x1 * az - z1 * ax) / den;          // position along the wall
    if (t > 0.05 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

const lidar: Gen = (n, rand) => {
  /* Drawn the way SLAM tools show a scan: the mapped walls as point surfaces,
     the robot's ray fan to each wall hit, and the scanner's rings on the floor. */
  const out = new Float32Array(n * 3);
  const lengths = WALLS.map(([x1, z1, x2, z2]) => Math.hypot(x2 - x1, z2 - z1));
  const total = lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) {
    const r = rand();
    let x: number, y: number, z: number;
    if (r < 0.7) {                                    // walls, area-weighted
      let pick = rand() * total, w = 0;
      while (pick > lengths[w]) { pick -= lengths[w]; w++; }
      const [x1, z1, x2, z2] = WALLS[w];
      const t = pick / lengths[w];
      x = x1 + (x2 - x1) * t; z = z1 + (z2 - z1) * t;
      y = FLOOR + rand() * (WALL_TOP - FLOOR);
    } else if (r < 0.8) {                             // ray fan: points along beams to the hit
      const az = (Math.floor(rand() * 180) / 180) * Math.PI * 2;
      const dx = Math.cos(az), dz = Math.sin(az);
      const d = rayHit(dx, dz);
      const t = Math.pow(rand(), 0.6) * (isFinite(d) ? d : 3);
      x = dx * t; z = dz * t; y = -0.05;
    } else {                                          // floor rings, clipped at the walls
      const ring = 0.5 + Math.floor(rand() * 6) * 0.45;
      const az = rand() * Math.PI * 2;
      const dx = Math.cos(az), dz = Math.sin(az);
      const d = Math.min(ring, rayHit(dx, dz) - 0.02);
      x = dx * d; z = dz * d; y = FLOOR;
    }
    out[i * 3] = x + jitter(rand, 0.025);
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z + jitter(rand, 0.025);
  }
  return out;
};

/* ── 02 sensor sphere ────────────────────────────────────────────────────── */

const sphere: Gen = (n, rand) => {
  const out = new Float32Array(n * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const band = Math.round(y * 9) / 9;               // pull points onto latitude bands
    const yy = y * 0.55 + band * 0.45;
    const r = Math.sqrt(1 - yy * yy);
    const th = golden * i;
    const R = 2.1 + jitter(rand, 0.04);
    out[i * 3] = Math.cos(th) * r * R;
    out[i * 3 + 1] = yy * R;
    out[i * 3 + 2] = Math.sin(th) * r * R;
  }
  return out;
};

/* ── 03 nine cards ───────────────────────────────────────────────────────── */

const cards: Gen = (n, rand) => {
  const out = new Float32Array(n * 3);
  const w = 1.25, h = 1.5, gx = 1.55, gy = 1.8;
  for (let i = 0; i < n; i++) {
    const c = i % 9;
    const cx = ((c % 3) - 1) * gx, cy = (1 - Math.floor(c / 3)) * gy;
    let x: number, y: number;
    if (rand() < 0.55) {                              // outline, so each card reads
      const t = rand() * 2 * (w + h);
      if (t < w) { x = t - w / 2; y = h / 2; }
      else if (t < w + h) { x = w / 2; y = h / 2 - (t - w); }
      else if (t < 2 * w + h) { x = w / 2 - (t - w - h); y = -h / 2; }
      else { x = -w / 2; y = -h / 2 + (t - 2 * w - h); }
    } else if (rand() < 0.5) {                        // the "image" block at the top
      x = (rand() - 0.5) * w * 0.86; y = h / 2 - 0.08 - rand() * h * 0.5;
    } else {                                          // two text lines
      x = -w * 0.42 + rand() * w * (rand() < 0.5 ? 0.84 : 0.5);
      y = -h * 0.18 - (rand() < 0.5 ? 0 : 0.18);
    }
    out[i * 3] = cx + x;
    out[i * 3 + 1] = cy + y;
    out[i * 3 + 2] = jitter(rand, 0.06);
  }
  return out;
};

/* ── 04 factory cell ─────────────────────────────────────────────────────── */

const cell: Gen = (n, rand) => {
  const out = new Float32Array(n * 3);
  const X = 2.6, Y = 1.5, Z = 1.9;
  const edges: number[][] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) edges.push([sx * X, -Y, sz * Z, sx * X, Y, sz * Z]);
  for (const y of [-Y, Y]) {
    edges.push([-X, y, -Z, X, y, -Z], [-X, y, Z, X, y, Z], [-X, y, -Z, -X, y, Z], [X, y, -Z, X, y, Z]);
  }
  // Racks and stations: a few boxes on the plate.
  const boxes = [[-1.6, -1.0, 0.7, 1.0, 0.4], [0.2, -0.6, 0.5, 0.5, 0.5], [1.5, 0.6, 0.6, 0.4, 0.6], [-0.5, 1.1, 0.9, 0.35, 0.3]];
  for (let i = 0; i < n; i++) {
    const r = rand();
    let x: number, y: number, z: number;
    if (r < 0.42) {                                   // enclosure frame
      const e = edges[Math.floor(rand() * edges.length)];
      const t = rand();
      x = e[0] + (e[3] - e[0]) * t; y = e[1] + (e[4] - e[1]) * t; z = e[2] + (e[5] - e[2]) * t;
    } else if (r < 0.7) {                             // perforated base plate (grid of holes)
      x = Math.round((rand() - 0.5) * 2 * X * 6) / 6; z = Math.round((rand() - 0.5) * 2 * Z * 6) / 6; y = -Y;
    } else {                                          // machines
      const [bx, bz, bw, bd, bh] = boxes[Math.floor(rand() * boxes.length)];
      const face = Math.floor(rand() * 3);
      const u = rand() - 0.5, v = rand();
      if (face === 0) { x = bx + u * bw; z = bz + (rand() < 0.5 ? -bd : bd) / 2; y = -Y + v * bh * 2.4; }
      else if (face === 1) { z = bz + u * bd; x = bx + (rand() < 0.5 ? -bw : bw) / 2; y = -Y + v * bh * 2.4; }
      else { x = bx + u * bw; z = bz + (rand() - 0.5) * bd; y = -Y + bh * 2.4; }
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
};

/* ── 05 career path ──────────────────────────────────────────────────────── */

const path: Gen = (n, rand) => {
  const out = new Float32Array(n * 3);
  const curve = (t: number) => [(t - 0.5) * 6, Math.sin(t * Math.PI * 1.4 - 0.6) * 0.9 + (t - 0.5) * 1.4, Math.cos(t * Math.PI * 2) * 0.8];
  for (let i = 0; i < n; i++) {
    let t: number, s: number;
    if (rand() < 0.35) { t = (Math.floor(rand() * 7) + 0.5) / 7; s = 0.22; }   // seven nodes
    else { t = rand(); s = 0.05; }
    const [x, y, z] = curve(t);
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * s;
    out[i * 3] = x + Math.cos(a) * r;
    out[i * 3 + 1] = y + Math.sin(a) * r;
    out[i * 3 + 2] = z + jitter(rand, s);
  }
  return out;
};

/* ── 06 method pipeline ──────────────────────────────────────────────────── */

const method: Gen = (n, rand) => {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x: number, y: number, z: number;
    if (rand() < 0.75) {
      const k = Math.floor(rand() * 4);
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = 0.6 + jitter(rand, 0.05);
      const s = Math.sqrt(1 - u * u);
      x = (k - 1.5) * 1.75 + Math.cos(th) * s * r; y = u * r; z = Math.sin(th) * s * r;
    } else {
      const t = rand();
      x = (t - 0.5) * 5.25; y = Math.sin(t * 40) * 0.05; z = Math.cos(t * 40) * 0.05;
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
};

/* ── 07 wave field ───────────────────────────────────────────────────────── */

const waves: Gen = (n) => {
  const out = new Float32Array(n * 3);
  const side = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const gx = (i % side) / (side - 1) - 0.5, gz = Math.floor(i / side) / (side - 1) - 0.5;
    const x = gx * 7, z = gz * 5;
    out[i * 3] = x;
    out[i * 3 + 1] = -0.6 + Math.sin(x * 1.1) * 0.25 + Math.cos(z * 1.6 + x * 0.4) * 0.2;
    out[i * 3 + 2] = z;
  }
  return out;
};

export const SHAPES: Gen[] = [lidar, sphere, cards, cell, path, method, waves];

/** How each shape is presented: a tilt (radians about x) and a scale. */
export const POSES: { tilt: number; scale: number }[] = [
  { tilt: 0.85, scale: 1.12 },   // look down into the scanned maze
  { tilt: 0.2, scale: 1 },
  { tilt: 0.0, scale: 0.95 },
  { tilt: 0.5, scale: 0.95 },
  { tilt: 0.1, scale: 1 },
  { tilt: 0.15, scale: 1 },
  { tilt: 0.45, scale: 1.1 },
];

/* ── MedQA set: the background follows the pipeline, not the scroll ────────
 *   0 idle      a DNA double helix
 *   1 running   embedding space — clusters being searched, one query point
 *   2 answered  a molecule: atoms joined by bonds
 */

const helix: Gen = (n, rand) => {
  const out = new Float32Array(n * 3);
  const turns = 2.6, R = 1.05, H = 6.4;
  for (let i = 0; i < n; i++) {
    const r = rand();
    let x: number, y: number, z: number;
    if (r < 0.72) {                                   // the two backbones
      const t = rand(), th = t * turns * Math.PI * 2 + (rand() < 0.5 ? 0 : Math.PI);
      x = Math.cos(th) * R; z = Math.sin(th) * R; y = (t - 0.5) * H;
      x += jitter(rand, 0.06); z += jitter(rand, 0.06); y += jitter(rand, 0.04);
    } else {                                          // base-pair rungs between them
      const k = Math.floor(rand() * 34), t = (k + 0.5) / 34, th = t * turns * Math.PI * 2;
      const u = rand() * 2 - 1;
      x = Math.cos(th) * R * u; z = Math.sin(th) * R * u; y = (t - 0.5) * H + jitter(rand, 0.02);
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
};

const embedding: Gen = (n, rand) => {
  const out = new Float32Array(n * 3);
  const centers: number[][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < 9; k++) {
    const y = 1 - (k / 8) * 2, r = Math.sqrt(1 - y * y), th = golden * k;
    centers.push([Math.cos(th) * r * 2.4, y * 2.0, Math.sin(th) * r * 2.4]);
  }
  for (let i = 0; i < n; i++) {
    let c: number[], s: number;
    if (rand() < 0.08) { c = [0, 0, 0]; s = 0.18; }   // the query
    else { c = centers[Math.floor(rand() * centers.length)]; s = 0.42; }
    // Box–Muller for a soft Gaussian cluster
    const g = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
    out[i * 3] = c[0] + g() * s; out[i * 3 + 1] = c[1] + g() * s; out[i * 3 + 2] = c[2] + g() * s;
  }
  return out;
};

const molecule: Gen = (n, rand) => {
  const out = new Float32Array(n * 3);
  // atoms of a small ring-plus-branches structure
  const atoms: number[][] = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; atoms.push([Math.cos(a) * 1.4, Math.sin(a) * 1.4 * 0.55, Math.sin(a) * 1.4 * 0.8]); }
  atoms.push([2.9, 0.4, 0.2], [-2.9, -0.4, -0.2], [0.3, 2.3, -0.6], [-0.3, -2.3, 0.6], [3.8, 1.3, -0.4], [-3.8, -1.3, 0.4]);
  const bonds = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [3, 7], [1, 8], [4, 9], [6, 10], [7, 11]];
  for (let i = 0; i < n; i++) {
    if (rand() < 0.62) {                             // atom shells
      const a = atoms[Math.floor(rand() * atoms.length)];
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = 0.42 + jitter(rand, 0.04);
      out[i * 3] = a[0] + Math.cos(th) * s * R; out[i * 3 + 1] = a[1] + u * R; out[i * 3 + 2] = a[2] + Math.sin(th) * s * R;
    } else {                                         // bonds
      const [p, q] = bonds[Math.floor(rand() * bonds.length)].map((j) => atoms[j]);
      const t = rand();
      out[i * 3] = p[0] + (q[0] - p[0]) * t + jitter(rand, 0.05);
      out[i * 3 + 1] = p[1] + (q[1] - p[1]) * t + jitter(rand, 0.05);
      out[i * 3 + 2] = p[2] + (q[2] - p[2]) * t + jitter(rand, 0.05);
    }
  }
  return out;
};

/* ── Physical AI set: one machine per chapter, for the split-stage theme ────
 *   01 a 6-DoF robot arm          02 the sense → model → act loop
 *   03 a quadruped                04 a factory cell: conveyor, boxes, gantry
 *   05 a quadrotor                06 a mobile robot scanning with LIDAR
 *   07 a humanoid
 * Built from a few primitives sampled by surface area, so each machine reads
 * as an outline rather than a blob. */

type V3 = [number, number, number];
type Part = { w: number; at: (rand: () => number) => V3 };

/** Points along a thick segment p → q. */
const seg = (p: V3, q: V3, r = 0.07): Part => {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  return {
    w: len * (0.6 + r * 4),
    at: (rand) => {
      const t = rand();
      return [p[0] + (q[0] - p[0]) * t + jitter(rand, r), p[1] + (q[1] - p[1]) * t + jitter(rand, r), p[2] + (q[2] - p[2]) * t + jitter(rand, r)];
    },
  };
};
/** Points on the surface of an axis-aligned box centred at c with size d. */
const box = (c: V3, d: V3): Part => ({
  w: 2 * (d[0] * d[1] + d[1] * d[2] + d[0] * d[2]),
  at: (rand) => {
    const p: V3 = [(rand() - 0.5) * d[0], (rand() - 0.5) * d[1], (rand() - 0.5) * d[2]];
    const ax = Math.floor(rand() * 3);
    p[ax] = (rand() < 0.5 ? -0.5 : 0.5) * d[ax];
    return [c[0] + p[0], c[1] + p[1], c[2] + p[2]];
  },
});
/** Points on a sphere shell. */
const ball = (c: V3, R: number): Part => ({
  w: 4 * Math.PI * R * R,
  at: (rand) => {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, k = Math.sqrt(1 - u * u);
    return [c[0] + Math.cos(th) * k * R, c[1] + u * R, c[2] + Math.sin(th) * k * R];
  },
});
/** A ring (torus-thin circle) in the plane given by `axis` ('x' | 'y' | 'z' normal). */
const ring = (c: V3, R: number, axis: 'x' | 'y' | 'z' = 'y', r = 0.04): Part => ({
  w: 2 * Math.PI * R * 0.5,
  at: (rand) => {
    const th = rand() * Math.PI * 2, a = Math.cos(th) * R + jitter(rand, r), b = Math.sin(th) * R + jitter(rand, r);
    if (axis === 'y') return [c[0] + a, c[1] + jitter(rand, r), c[2] + b];
    if (axis === 'x') return [c[0] + jitter(rand, r), c[1] + a, c[2] + b];
    return [c[0] + a, c[1] + b, c[2] + jitter(rand, r)];
  },
});
/** A filled disc (wheels, rotor sweeps), normal along `axis`. */
const disc = (c: V3, R: number, axis: 'x' | 'y' | 'z' = 'y'): Part => ({
  w: Math.PI * R * R * 0.8,
  at: (rand) => {
    const th = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * R, a = Math.cos(th) * rr, b = Math.sin(th) * rr;
    if (axis === 'y') return [c[0] + a, c[1], c[2] + b];
    if (axis === 'x') return [c[0], c[1] + a, c[2] + b];
    return [c[0] + a, c[1] + b, c[2]];
  },
});

function sample(parts: Part[], n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n * 3);
  const total = parts.reduce((a, p) => a + p.w, 0);
  for (let i = 0; i < n; i++) {
    let pick = rand() * total, k = 0;
    while (k < parts.length - 1 && pick > parts[k].w) { pick -= parts[k].w; k++; }
    const v = parts[k].at(rand);
    out[i * 3] = v[0]; out[i * 3 + 1] = v[1]; out[i * 3 + 2] = v[2];
  }
  // Centre on the bounding box, so every machine sits in the middle of the stage.
  for (let ax = 0; ax < 3; ax++) {
    let lo = Infinity, hi = -Infinity;
    for (let i = ax; i < out.length; i += 3) { lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
    const mid = (lo + hi) / 2;
    for (let i = ax; i < out.length; i += 3) out[i] -= mid;
  }
  return out;
}

const robotArm: Gen = (n, rand) => {
  const base: V3 = [0, -2.2, 0], shoulder: V3 = [0, -1.2, 0], elbow: V3 = [1.1, 0.5, 0.2], wrist: V3 = [2.0, -0.2, 0.3], tool: V3 = [2.3, -0.9, 0.3];
  return sample([
    disc([0, -2.6, 0], 1.3), ring([0, -2.6, 0], 1.3, 'y'),
    box([0, -2.1, 0], [1.0, 0.9, 1.0]), ball(shoulder, 0.38),
    seg(shoulder, elbow, 0.2), ball(elbow, 0.3), seg(elbow, wrist, 0.15), ball(wrist, 0.22), seg(wrist, tool, 0.1),
    seg([2.3, -0.9, 0.3], [2.1, -1.5, 0.3], 0.05), seg([2.3, -0.9, 0.3], [2.5, -1.5, 0.3], 0.05),   // gripper fingers
    box([2.3, -2.2, 0.3], [0.5, 0.5, 0.5]),                                                          // the part it picks
    ring(base, 2.6, 'y', 0.02),                                                                     // reach envelope
  ], n, rand);
};

const senseLoop: Gen = (n, rand) => {
  const nodes: V3[] = [[0, 1.9, 0], [-2.1, -1.3, 0], [2.1, -1.3, 0]];
  const parts: Part[] = nodes.flatMap((c) => [ball(c, 0.55), ring(c, 0.95, 'z', 0.03)]);
  for (let k = 0; k < 3; k++) {                       // arcs between the stages
    const a = nodes[k], b = nodes[(k + 1) % 3];
    const mid: V3 = [(a[0] + b[0]) * 0.62, (a[1] + b[1]) * 0.62, 0.4];
    parts.push(seg(a, mid, 0.05), seg(mid, b, 0.05));
  }
  return sample(parts, n, rand);
};

const quadruped: Gen = (n, rand) => {
  const parts: Part[] = [box([0, 0.3, 0], [3.0, 0.7, 1.2]), box([1.85, 0.5, 0], [0.6, 0.5, 0.7])];
  for (const [x, z, ph] of [[1.2, 0.6, 0], [1.2, -0.6, 1], [-1.2, 0.6, 1], [-1.2, -0.6, 0]] as const) {
    const hip: V3 = [x, 0, z], knee: V3 = [x + (ph ? 0.35 : -0.25), -1.0, z * 1.1], foot: V3 = [x + (ph ? 0.05 : -0.45), -2.0, z * 1.1];
    parts.push(ball(hip, 0.2), seg(hip, knee, 0.1), ball(knee, 0.14), seg(knee, foot, 0.08));
  }
  parts.push(disc([0, -2.05, 0], 2.6));               // ground
  return sample(parts, n, rand);
};

const factoryCell: Gen = (n, rand) => {
  const parts: Part[] = [
    box([0, -1.4, 0], [5.6, 0.25, 1.2]),                                    // belt
    ...[-2.4, -1.2, 0, 1.2, 2.4].map((x) => ring([x, -1.4, 0], 0.18, 'z', 0.02)),
    ...[-1.8, 0.2, 1.9].map((x) => box([x, -1.0, 0], [0.55, 0.55, 0.55])),  // workpieces
    seg([-2.6, -1.5, -0.6], [-2.6, 1.6, -0.6], 0.06), seg([2.6, -1.5, -0.6], [2.6, 1.6, -0.6], 0.06),
    seg([-2.6, 1.6, -0.6], [2.6, 1.6, -0.6], 0.06),                         // gantry
    box([0.2, 1.4, -0.3], [0.5, 0.4, 0.6]), seg([0.2, 1.2, -0.1], [0.2, -0.4, 0], 0.05),
    box([0, -2.0, 0], [5.8, 0.08, 1.8]),                                    // base plate
  ];
  return sample(parts, n, rand);
};

const quadrotor: Gen = (n, rand) => {
  const arms: V3[] = [[1.7, 0, 1.7], [-1.7, 0, 1.7], [1.7, 0, -1.7], [-1.7, 0, -1.7]];
  const parts: Part[] = [box([0, 0, 0], [0.9, 0.35, 0.9])];
  for (const a of arms) {
    parts.push(seg([0, 0, 0], a, 0.07), seg(a, [a[0], 0.35, a[2]], 0.05), ring([a[0], 0.4, a[2]], 0.95, 'y', 0.03), disc([a[0], 0.4, a[2]], 0.9));
  }
  parts.push(seg([0.3, -0.2, 0.3], [0.5, -0.9, 0.5], 0.04), seg([-0.3, -0.2, -0.3], [-0.5, -0.9, -0.5], 0.04));
  return sample(parts, n, rand);
};

const mobileLidar: Gen = (n, rand) => {
  const W = 2.8, D = 2.2, floor = -1.2;              // room half-extents
  const parts: Part[] = [
    box([0, floor + 0.45, 0], [1.5, 0.5, 1.1]),                                // chassis
    ...[[0.55, 0.62], [-0.55, 0.62], [0.55, -0.62], [-0.55, -0.62]].map(([x, z]) => disc([x, floor + 0.25, z], 0.28, 'z')),
    box([0, floor + 0.85, 0], [0.36, 0.3, 0.36]),                              // LIDAR puck
    box([0, floor + 0.6, D], [2 * W, 1.2, 0.06]), box([0, floor + 0.6, -D], [2 * W, 1.2, 0.06]),
    box([W, floor + 0.6, 0], [0.06, 1.2, 2 * D]), box([-W, floor + 0.6, 0], [0.06, 1.2, 1.2]),   // walls, a doorway on the left
    box([-0.9, floor + 0.6, 1.2], [1.4, 1.2, 0.06]),                           // an inner wall
  ];
  const head: V3 = [0, floor + 0.9, 0];
  for (let k = 0; k < 16; k++) {                       // beams to the nearest wall
    const az = (k / 16) * Math.PI * 2 + 0.1, dx = Math.cos(az), dz = Math.sin(az);
    const d = Math.min(Math.abs(dx) > 1e-6 ? W / Math.abs(dx) : 99, Math.abs(dz) > 1e-6 ? D / Math.abs(dz) : 99);
    parts.push(seg(head, [dx * d, head[1], dz * d], 0.015));
  }
  return sample(parts, n, rand);
};

const humanoid: Gen = (n, rand) => {
  const parts: Part[] = [
    ball([0, 2.15, 0], 0.42), seg([0, 1.7, 0], [0, 1.45, 0], 0.1),
    box([0, 0.75, 0], [1.3, 1.4, 0.6]), box([0, -0.15, 0], [1.0, 0.4, 0.5]),
    seg([0.8, 1.35, 0], [1.25, 0.3, 0.2], 0.12), seg([1.25, 0.3, 0.2], [1.4, -0.6, 0.6], 0.1),
    seg([-0.8, 1.35, 0], [-1.25, 0.3, -0.1], 0.12), seg([-1.25, 0.3, -0.1], [-1.35, -0.6, -0.2], 0.1),
    seg([0.35, -0.4, 0], [0.45, -1.4, 0.15], 0.14), seg([0.45, -1.4, 0.15], [0.45, -2.4, 0], 0.11),
    seg([-0.35, -0.4, 0], [-0.45, -1.4, -0.1], 0.14), seg([-0.45, -1.4, -0.1], [-0.45, -2.4, 0], 0.11),
    box([0.5, -2.5, 0.15], [0.4, 0.15, 0.7]), box([-0.5, -2.5, 0.15], [0.4, 0.15, 0.7]),
    disc([0, -2.6, 0], 2.2),
  ];
  return sample(parts, n, rand);
};

/* ── HIL bench set: hardware-in-the-loop and aerospace, for the HIL theme ──
 *   01 an ECU on the bench, cabled out      02 the closed loop: controller ↔ plant
 *   03 a HIL rack of I/O boards             04 an aircraft, wireframe
 *   05 a virtual vehicle                    06 scope traces on a graticule
 *   07 a satellite
 */

/** Points along a parametric curve t ∈ [0, 1]. */
const curve = (f: (t: number) => V3, len: number, r = 0.03): Part => ({
  w: len,
  at: (rand) => { const v = f(rand()); return [v[0] + jitter(rand, r), v[1] + jitter(rand, r), v[2] + jitter(rand, r)]; },
});

const ecuBench: Gen = (n, rand) => {
  const parts: Part[] = [
    box([0, -0.4, 0], [3.6, 0.12, 2.4]),                                       // PCB
    box([-0.6, -0.2, -0.2], [1.0, 0.25, 1.0]), box([0.9, -0.25, 0.5], [0.6, 0.18, 0.6]), box([0.9, -0.25, -0.6], [0.5, 0.18, 0.4]),
    box([-1.55, -0.15, 0], [0.4, 0.5, 1.8]),                                   // connector
    box([0, -1.5, 0], [5.2, 0.08, 3.4]),                                       // bench
  ];
  for (let k = 0; k < 6; k++) {                                                // harness out of the connector
    const z = -0.7 + k * 0.28;
    parts.push(curve((t) => [-1.75 - t * 1.4, -0.15 - Math.sin(t * Math.PI) * 0.9 + t * 0.2, z * (1 - t * 0.3)], 2.2, 0.02));
  }
  return sample(parts, n, rand);
};

const closedLoop: Gen = (n, rand) => {
  const ctrl: V3 = [-1.9, 0, 0], plant: V3 = [1.9, 0, 0];
  return sample([
    box(ctrl, [1.4, 1.0, 1.0]), box(plant, [1.6, 1.2, 1.2]),
    curve((t) => [-1.2 + t * 2.4, 0.6 + Math.sin(t * Math.PI) * 1.3, 0], 3.2),                  // command →
    curve((t) => [1.2 - t * 2.4, -0.6 - Math.sin(t * Math.PI) * 1.3, 0], 3.2),                  // ← measurement
    curve((t) => [-1.2 + t * 2.4, 0.6 + Math.sin(t * Math.PI) * 1.3 + Math.sin(t * 40) * 0.08, 0.3], 3.2, 0.015),
    ring([0, 0, 0], 2.9, 'z', 0.02),
  ], n, rand);
};

const hilRack: Gen = (n, rand) => {
  const parts: Part[] = [box([0, 0, 0], [2.2, 4.6, 1.6])];
  for (let k = 0; k < 9; k++) parts.push(box([0, -1.9 + k * 0.48, 0.82], [1.9, 0.34, 0.04]));   // board fronts
  for (let k = 0; k < 7; k++) {
    const y = -1.6 + k * 0.5;
    parts.push(curve((t) => [-0.6 + t * 0.2 + Math.sin(t * Math.PI) * 0.1, y - t * (y + 2.4), 0.9 + Math.sin(t * Math.PI) * 1.4], 3.0, 0.02));
  }
  parts.push(box([0, -2.4, 1.6], [3.4, 0.06, 1.6]));
  return sample(parts, n, rand);
};

const aircraft: Gen = (n, rand) => {
  const fus: Part = curve((t) => {
    const x = -3 + t * 6, r = 0.42 * Math.sin(Math.min(1, (t + 0.08)) * Math.PI) ** 0.5, a = rand() * Math.PI * 2;
    return [x, Math.cos(a) * r, Math.sin(a) * r];
  }, 8, 0.01);
  return sample([
    fus,
    box([0.2, -0.05, 0], [1.2, 0.06, 6.4]),                                     // main wing
    box([-2.6, 0.05, 0], [0.6, 0.05, 2.2]),                                     // tailplane
    box([-2.6, 0.6, 0], [0.7, 1.1, 0.05]),                                      // fin
    ring([0.4, -0.45, 1.6], 0.22, 'x', 0.02), ring([0.4, -0.45, -1.6], 0.22, 'x', 0.02),   // engines
    seg([0.6, -0.45, 1.6], [-0.1, -0.45, 1.6], 0.18), seg([0.6, -0.45, -1.6], [-0.1, -0.45, -1.6], 0.18),
  ], n, rand);
};

const vehicle: Gen = (n, rand) => sample([
  box([0, -0.4, 0], [4.2, 0.8, 1.9]), box([-0.2, 0.35, 0], [2.2, 0.7, 1.7]),
  ...[[1.35, 0.95], [-1.35, 0.95], [1.35, -0.95], [-1.35, -0.95]].map(([x, z]) => disc([x, -0.85, z], 0.48, 'z')),
  ...[[1.35, 0.95], [-1.35, 0.95], [1.35, -0.95], [-1.35, -0.95]].map(([x, z]) => ring([x, -0.85, z], 0.48, 'z', 0.03)),
  box([0, -1.35, 0], [6.4, 0.04, 3.4]),                                         // road
  ...[-2.4, -0.8, 0.8, 2.4].map((x) => box([x, -1.3, 0], [0.8, 0.02, 0.12])),   // lane marks
], n, rand);

const scope: Gen = (n, rand) => {
  const W = 3.0, H = 2.0;
  const parts: Part[] = [];
  for (let k = -4; k <= 4; k++) parts.push(seg([k * W / 4, -H, 0], [k * W / 4, H, 0], 0.008));   // graticule
  for (let k = -4; k <= 4; k++) parts.push(seg([-W, k * H / 4, 0], [W, k * H / 4, 0], 0.008));
  const traces = [
    (t: number): V3 => [-W + t * 2 * W, 1.0 + Math.sin(t * Math.PI * 6) * 0.45, 0.05],                       // sine
    (t: number): V3 => [-W + t * 2 * W, -0.1 + (Math.sin(t * Math.PI * 8) > 0 ? 0.4 : -0.4), 0.05],           // PWM
    (t: number): V3 => [-W + t * 2 * W, -1.1 + 0.6 * (1 - Math.exp(-t * 6)) * (1 + 0.25 * Math.exp(-t * 4) * Math.sin(t * 30)), 0.05],  // step response
  ];
  for (const f of traces) for (let r = 0; r < 4; r++) parts.push(curve(f, 4.5, 0.02));
  return sample(parts, n, rand);
};

const satellite: Gen = (n, rand) => sample([
  box([0, 0, 0], [1.1, 1.1, 1.4]),
  box([-2.0, 0, 0], [2.6, 0.04, 1.1]), box([2.0, 0, 0], [2.6, 0.04, 1.1]),
  seg([-0.55, 0, 0], [-0.7, 0, 0], 0.04), seg([0.55, 0, 0], [0.7, 0, 0], 0.04),
  ring([0, 0.95, 0.4], 0.6, 'y', 0.02), disc([0, 0.95, 0.4], 0.6), seg([0, 0.55, 0], [0, 0.95, 0.4], 0.04),
  ring([0, 0, 0], 3.2, 'x', 0.015),                                             // orbit
], n, rand);

/** Captions for the HIL bench stage readout. */
export const HIL_LABELS = [
  'ECU under test · harness out',
  'Closed loop · controller ↔ plant',
  'HIL rack · I/O boards',
  'Aircraft · airframe model',
  'Virtual vehicle · road model',
  'Scope · sine, PWM, step response',
  'Satellite · attitude and power',
];

/** What each Physical AI shape is, for the stage's caption. */
export const PHYSICAL_LABELS = [
  'Manipulator · 6-DoF arm, pick',
  'Loop · sense → model → act',
  'Legged robot · trot gait',
  'Factory cell · conveyor and gantry',
  'Quadrotor · four rotors',
  'Mobile robot · LIDAR scan',
  'Humanoid · whole-body',
];

export type ShapeSet = 'home' | 'medqa' | 'physical' | 'hil';

export const SETS: Record<ShapeSet, { shapes: Gen[]; poses: { tilt: number; scale: number }[] }> = {
  home: { shapes: SHAPES, poses: POSES },
  medqa: {
    shapes: [helix, embedding, molecule],
    poses: [{ tilt: 0.12, scale: 1.0 }, { tilt: 0.25, scale: 1.0 }, { tilt: 0.3, scale: 1.05 }],
  },
  hil: {
    shapes: [ecuBench, closedLoop, hilRack, aircraft, vehicle, scope, satellite],
    poses: [
      { tilt: 0.55, scale: 0.95 }, { tilt: 0.05, scale: 0.95 }, { tilt: 0.15, scale: 0.85 }, { tilt: 0.5, scale: 0.9 },
      { tilt: 0.35, scale: 0.95 }, { tilt: 0.0, scale: 1.0 }, { tilt: 0.3, scale: 0.85 },
    ],
  },
  physical: {
    shapes: [robotArm, senseLoop, quadruped, factoryCell, quadrotor, mobileLidar, humanoid],
    poses: [
      { tilt: 0.18, scale: 0.92 }, { tilt: 0.0, scale: 0.95 }, { tilt: 0.2, scale: 0.95 }, { tilt: 0.3, scale: 0.8 },
      { tilt: 0.45, scale: 0.68 }, { tilt: 0.6, scale: 0.8 }, { tilt: 0.08, scale: 0.92 },
    ],
  },
};

export function buildShapes(n: number, set: ShapeSet = 'home'): Float32Array[] {
  return SETS[set].shapes.map((g, i) => g(n, rng(1337 + i * 101)));
}
