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

export function buildShapes(n: number): Float32Array[] {
  return SHAPES.map((g, i) => g(n, rng(1337 + i * 101)));
}
