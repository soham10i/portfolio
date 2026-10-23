/* Unit tests for app/public/nav-core.js — the pure navigation math behind
   the /robot demo. Run: npm test (node --test).

   Scenarios are cross-checked against the project's Python controllers
   (autonomouse_robots — Maze2…Maze5/controllers/mak_02_controller/), which
   this code is a browser port of:
     - astar.py      8-connected A*, diagonal cost sqrt(2)·res, goal snapping
     - mapping.py    log-odds occupancy with an occupied latch
     - frontier.py   nearest known-free cell bordering the unknown
     - local_planner.py  pure pursuit: project, then lookahead
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../public/nav-core.js');
const NC = globalThis.NavCore;
assert.ok(NC, 'nav-core.js must attach NavCore to globalThis');

/* Grid fixture: 20×20 cells, 0.05 m resolution, origin at (-0.5, -0.5) —
   the same scale the site uses (P.RES = 0.05). */
const GN = 20, RES = 0.05, GO = [-0.5, -0.5];
const K = (i, j) => j * GN + i;
const freshGrid = () => new Float32Array(GN * GN); // 0 = unknown
const CENTER = (i, j) => [GO[0] + (i + 0.5) * RES, GO[1] + (j + 0.5) * RES];

/* The site's controller constants (webots-world-3d.js P block). */
const P = { V_MAX: 0.35, W_MAX: 2.2, PIVOT_BEARING: 0.6, CARROT: 0.42 };

// ── angle & grid primitives ────────────────────────────────────────────────

test('wrapPi keeps angles inside (-pi, pi]', () => {
  assert.equal(NC.wrapPi(0.3), 0.3);
  assert.ok(Math.abs(NC.wrapPi(Math.PI) - Math.PI) < 1e-12);
  assert.ok(Math.abs(NC.wrapPi(4 * Math.PI)) < 1e-12);
  assert.ok(Math.abs(NC.wrapPi(Math.PI + 0.1) - (-Math.PI + 0.1)) < 1e-9);
  assert.ok(Math.abs(NC.wrapPi(-Math.PI - 0.1) - (Math.PI - 0.1)) < 1e-9);
});

test('cellOf / cellCenter round-trip; out of bounds returns -1', () => {
  const k = NC.cellOf(...CENTER(7, 12), GO, RES, GN);
  assert.equal(k, K(7, 12));
  const [x, y] = NC.cellCenter(k, GO, RES, GN);
  assert.ok(Math.abs(x - CENTER(7, 12)[0]) < 1e-12);
  assert.ok(Math.abs(y - CENTER(7, 12)[1]) < 1e-12);
  assert.equal(NC.cellOf(GO[0] - 0.01, 0, GO, RES, GN), -1);
  assert.equal(NC.cellOf(0, GO[1] + GN * RES + 0.01, GO, RES, GN), -1);
});

// ── log-odds integration (mirrors mapping.py) ─────────────────────────────

test('integrate: beam discounts free space and reinforces a real hit', () => {
  const grid = freshGrid();
  const pose = { x: CENTER(2, 10)[0], y: CENTER(2, 10)[1] };
  const hitX = CENTER(10, 10)[0];
  NC.integrate(grid, GN, GO, RES, pose, 0, hitX - pose.x, true, 5.0);

  // Endpoint reinforced by exactly +1.3 on the first observation.
  assert.ok(Math.abs(grid[K(10, 10)] - 1.3) < 1e-6);
  // A cell the beam passed through is discounted below 0 (unknown → free-ish).
  assert.ok(grid[K(5, 10)] < 0, `mid-beam cell should be < 0, got ${grid[K(5, 10)]}`);
  // A cell off the beam is untouched.
  assert.equal(grid[K(5, 11)], 0);
});

test('integrate: confirmed occupancy latches against later free beams', () => {
  const grid = freshGrid();
  const pose = { x: CENTER(2, 10)[0], y: CENTER(2, 10)[1] };
  grid[K(5, 10)] = 0.6; // above the 0.5 latch threshold, below the 0.7 display one
  NC.integrate(grid, GN, GO, RES, pose, 0, CENTER(12, 10)[0] - pose.x, true, 5.0);
  assert.ok(Math.abs(grid[K(5, 10)] - 0.6) < 1e-6, 'latched cell must not be discounted');
});

test('integrate: reinforcement caps at 4, discount floors at -3', () => {
  const grid = freshGrid();
  const pose = { x: CENTER(2, 10)[0], y: CENTER(2, 10)[1] };
  grid[K(10, 10)] = 3.5;
  NC.integrate(grid, GN, GO, RES, pose, 0, CENTER(10, 10)[0] - pose.x, true, 5.0);
  assert.equal(grid[K(10, 10)], 4);

  const g2 = freshGrid();
  g2[K(5, 10)] = -2.99;
  NC.integrate(g2, GN, GO, RES, pose, 0, CENTER(12, 10)[0] - pose.x, true, 5.0);
  assert.ok(g2[K(5, 10)] >= -3, `discount must floor at -3, got ${g2[K(5, 10)]}`);
});

test('integrate: a max-range reading reinforces nothing', () => {
  const grid = freshGrid();
  const pose = { x: CENTER(2, 10)[0], y: CENTER(2, 10)[1] };
  NC.integrate(grid, GN, GO, RES, pose, 0, 5.0, true, 5.0);
  assert.ok(!Array.from(grid).some((v) => v > 0), 'no cell may be marked occupied');
});

// ── inflation & goal snapping (mirrors astar.py _nearest_free) ────────────

test('blocked: inflation radius and the 0.7 occupancy threshold', () => {
  const grid = freshGrid();
  grid[K(10, 10)] = 2.0;
  assert.equal(NC.blocked(grid, GN, K(10, 10), 0), true);
  assert.equal(NC.blocked(grid, GN, K(9, 10), 0), false);
  assert.equal(NC.blocked(grid, GN, K(9, 10), 1), true);   // inside the halo
  assert.equal(NC.blocked(grid, GN, K(8, 10), 1), false);  // outside it

  grid[K(12, 12)] = 0.7;  // exactly at the threshold: not occupied
  assert.equal(NC.blocked(grid, GN, K(12, 12), 0), false);
  grid[K(12, 12)] = 0.71;
  assert.equal(NC.blocked(grid, GN, K(12, 12), 0), true);
});

test('boxedIn: true only when every 8-neighbour is impassable', () => {
  const grid = freshGrid();
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (di || dj) grid[K(5 + di, 5 + dj)] = 2.0;
  }
  assert.equal(NC.boxedIn(grid, GN, K(5, 5), 0), true);
  grid[K(6, 5)] = 0;
  assert.equal(NC.boxedIn(grid, GN, K(5, 5), 0), false);
});

test('freeNear: identity when passable, known-free ring cell preferred', () => {
  const grid = freshGrid();
  assert.equal(NC.freeNear(grid, GN, K(4, 4), 12, 0), K(4, 4));
  assert.equal(NC.freeNear(grid, GN, -1, 12, 0), -1);

  // Block the target; ring r=1 holds an unknown cell and a known-free one.
  grid[K(10, 10)] = 2.0;
  grid[K(11, 11)] = -1.0; // known free — must win over unknown ring cells
  const snapped = NC.freeNear(grid, GN, K(10, 10), 12, 0);
  assert.equal(snapped, K(11, 11));
  assert.equal(NC.blocked(grid, GN, snapped, 0), false);
});

test('freeNear: returns -1 when every ring up to maxCells is impassable', () => {
  const grid = freshGrid().fill(2.0); // all occupied
  assert.equal(NC.freeNear(grid, GN, K(10, 10), 3, 0), -1);
});

// ── A* (mirrors astar.py plan) ─────────────────────────────────────────────

test('astar: open grid yields the optimal diagonal path', () => {
  const grid = freshGrid();
  const pts = NC.astar(grid, GN, GO, RES, K(2, 2), K(17, 17), 0);
  assert.ok(pts, 'path must exist');
  assert.deepEqual(pts[0], CENTER(2, 2));
  assert.deepEqual(pts[pts.length - 1], CENTER(17, 17));
  // 15 king-moves diagonally: 16 waypoints. The Python controller's octile
  // heuristic finds the same optimum; the JS port uses the Euclidean heuristic.
  assert.equal(pts.length, 16);
  for (let n = 1; n < pts.length; n++) {
    const di = Math.abs(pts[n][0] - pts[n - 1][0]);
    const dj = Math.abs(pts[n][1] - pts[n - 1][1]);
    assert.ok(di <= RES + 1e-9 && dj <= RES + 1e-9, 'path must be 8-connected');
  }
});

test('astar: routes through the only gap and never enters an occupied cell', () => {
  const grid = freshGrid();
  for (let j = 0; j <= 17; j++) grid[K(10, j)] = 2.0; // wall, gap at j=18..19
  const pts = NC.astar(grid, GN, GO, RES, K(2, 10), K(17, 10), 0);
  assert.ok(pts, 'path must detour through the gap');
  for (const [x, y] of pts) {
    const k = NC.cellOf(x, y, GO, RES, GN);
    assert.ok(grid[k] <= 0.7, `path entered occupied cell ${k}`);
  }
  // The detour must dip below the wall's end (row index >= 18).
  assert.ok(pts.some(([, y]) => NC.cellOf(0, y, GO, RES, GN) >= 0
    && Math.floor((y - GO[1]) / RES) >= 18));
});

test('astar: an enclosed goal is unreachable → null (why freeNear exists)', () => {
  const grid = freshGrid();
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    grid[K(10 + di, 10 + dj)] = 2.0; // pillar and its halo, like the mission posts
  }
  assert.equal(NC.astar(grid, GN, GO, RES, K(2, 2), K(10, 10), 0), null);
  // The mission flow: snap to the halo's edge, then planning succeeds.
  const snapped = NC.freeNear(grid, GN, K(10, 10), 12, 0);
  assert.ok(snapped >= 0);
  assert.ok(NC.astar(grid, GN, GO, RES, K(2, 2), snapped, 0), 'snapped goal must be reachable');
});

test('astar: start equals goal returns the single point', () => {
  const grid = freshGrid();
  const pts = NC.astar(grid, GN, GO, RES, K(7, 7), K(7, 7), 0);
  assert.deepEqual(pts, [CENTER(7, 7)]);
});

// ── frontier selection (mirrors frontier.py) ──────────────────────────────

test('pickFrontier: nearest known-free cell bordering the unknown', () => {
  const grid = freshGrid();
  for (let j = 4; j <= 16; j++) for (let i = 4; i <= 16; i++) grid[K(i, j)] = -1.0;
  const pose = { x: CENTER(10, 10)[0], y: CENTER(10, 10)[1] };
  const fk = NC.pickFrontier(grid, GN, GO, RES, pose, [0, 0], 1.0, 0.10, 0);
  assert.ok(fk >= 0, 'a frontier must exist around the known pocket');
  assert.ok(grid[fk] < -0.7, 'frontier cell must be known-free');
  // It must sit on the pocket's edge: at least two unknown 8-neighbours.
  const fi = fk % GN, fj = (fk - fi) / GN;
  assert.ok(fi <= 5 || fi >= 15 || fj <= 5 || fj >= 15, 'frontier is on the explored edge');
});

test('pickFrontier: -1 when nothing qualifies', () => {
  const grid = freshGrid(); // all unknown — no known-free cell at all
  const pose = { x: 0, y: 0 };
  assert.equal(NC.pickFrontier(grid, GN, GO, RES, pose, [0, 0], 1.0, 0.10, 0), -1);
});

// ── pure pursuit (mirrors local_planner.py) ───────────────────────────────

test('trackAhead: projects laterally and never moves the index backwards', () => {
  const path = [];
  for (let i = 0; i < 20; i++) path.push([i * 0.05, 0]);
  // Robot abreast of point 3, offset 0.1 m laterally.
  const t1 = NC.trackAhead(path, 0, 3 * 0.05, 0.1, P.CARROT);
  assert.equal(t1.pathI, 3);
  assert.ok(Math.abs(t1.bestD - 0.1) < 1e-9);
  // Carrot is the final point when the remaining path is shorter than CARROT,
  // otherwise the first point at least CARROT along the path.
  const t2 = NC.trackAhead(path, 0, 0, 0, P.CARROT);
  assert.deepEqual(t2.carrot, path[9]); // 9 × 0.05 = 0.45 ≥ 0.42
  // A doubling-back pose must not drag the index back.
  const t3 = NC.trackAhead(path, t1.pathI, 0, 0, P.CARROT);
  assert.ok(t3.pathI >= t1.pathI, 'projection is monotonic');
});

test('pursuitCommand: straight ahead, pivot, clamp, and hard stop', () => {
  // Straight ahead, clear: full speed, no turn.
  let cmd = NC.pursuitCommand(0, 1.0, P);
  assert.ok(Math.abs(cmd.v - P.V_MAX) < 1e-9);
  assert.equal(cmd.w, 0);
  assert.equal(cmd.replan, false);

  // Beyond the pivot bearing: turn in place.
  cmd = NC.pursuitCommand(0.7, 1.0, P);
  assert.equal(cmd.v, 0);
  assert.ok(Math.abs(cmd.w - 1.4) < 1e-9);

  // Large error clamps to W_MAX.
  cmd = NC.pursuitCommand(-2.0, 1.0, P);
  assert.equal(cmd.w, -P.W_MAX);

  // Something within 0.16 m ahead: stop, turn away, ask for a replan.
  cmd = NC.pursuitCommand(0.1, 0.10, P);
  assert.equal(cmd.v, 0);
  assert.ok(Math.abs(cmd.w - P.W_MAX * 0.5) < 1e-9);
  assert.equal(cmd.replan, true);

  // Speed scales with clearance: 0.2 m ahead, small bearing.
  cmd = NC.pursuitCommand(0.3, 0.2, P);
  const expect = P.V_MAX * Math.cos(0.3) * ((0.2 - 0.14) / 0.5);
  assert.ok(Math.abs(cmd.v - expect) < 1e-9);
});
