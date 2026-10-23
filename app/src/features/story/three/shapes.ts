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

export type ShapeSet = 'home' | 'medqa';

export const SETS: Record<ShapeSet, { shapes: Gen[]; poses: { tilt: number; scale: number }[] }> = {
  home: { shapes: SHAPES, poses: POSES },
  medqa: {
    shapes: [helix, embedding, molecule],
    poses: [{ tilt: 0.12, scale: 1.0 }, { tilt: 0.25, scale: 1.0 }, { tilt: 0.3, scale: 1.05 }],
  },
};

export function buildShapes(n: number, set: ShapeSet = 'home'): Float32Array[] {
  return SETS[set].shapes.map((g, i) => g(n, rng(1337 + i * 101)));
}

/* Retired: the Physical AI / HIL split-stage themes and their machine shapes
 * (robot arm, quadruped, ECU bench, aircraft, …) were removed with the theme
 * system cleanup. Only the home chapters and the MedQA pipeline remain. */
