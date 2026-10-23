/* nav-core.js — the pure navigation math of <webots-world-3d>, extracted so it
   can be unit-tested in Node (app/test/nav-core.test.mjs) while the web
   component keeps rendering concerns to itself.

   The algorithms mirror the project's Python controllers
   (autonomouse_robots/…/mak_02_controller/{astar,mapping,frontier,local_planner}.py):
   a log-odds occupancy grid with an occupied-latch, A* over an 8-connected
   grid with obstacle inflation by the robot radius, frontier selection for
   exploration, and pure-pursuit path tracking with a monotonic projection.

   No DOM, no THREE, no globals beyond the export. Loaded in the browser as a
   plain script (window.NavCore) and in Node as a side-effect import
   (globalThis.NavCore). */
(function (root) {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  /* World (x, y) → flat grid index, or -1 outside the grid. */
  function cellOf(x, y, go, res, gn) {
    const i = Math.floor((x - go[0]) / res);
    const j = Math.floor((y - go[1]) / res);
    return (i < 0 || j < 0 || i >= gn || j >= gn) ? -1 : j * gn + i;
  }

  /* Flat grid index → world (x, y) of the cell centre. */
  function cellCenter(k, go, res, gn) {
    const i = k % gn, j = (k - i) / gn;
    return [go[0] + (i + 0.5) * res, go[1] + (j + 0.5) * res];
  }

  /* One LIDAR beam into the log-odds grid: free space along the beam is
     discounted (−0.35, floored at −3), the endpoint of a real hit is
     reinforced (+1.3, capped at 4). Cells already above 0.5 are NOT
     discounted — once occupancy is confirmed it latches, so a later beam
     grazing the same cell cannot erase a wall. Mutates `grid`. */
  function integrate(grid, gn, go, res, pose, a, d, hitWall, lidarMax) {
    const step = res * 0.7;
    const free = Math.max(d - res * 1.6, 0);
    for (let t = 0.05; t < free; t += step) {
      const k = cellOf(pose.x + Math.cos(a) * t, pose.y + Math.sin(a) * t, go, res, gn);
      if (k >= 0 && grid[k] <= 0.5) grid[k] = Math.max(grid[k] - 0.35, -3);
    }
    if (hitWall && d < lidarMax) {
      const k = cellOf(pose.x + Math.cos(a) * d, pose.y + Math.sin(a) * d, go, res, gn);
      if (k >= 0) grid[k] = Math.min(grid[k] + 1.3, 4);
    }
  }

  /* Occupancy test with the robot radius inflated by `inflate` cells. */
  function blocked(grid, gn, k, inflate) {
    const i = k % gn, j = (k - i) / gn;
    for (let dj = -inflate; dj <= inflate; dj++) {
      for (let di = -inflate; di <= inflate; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= gn || jj >= gn) continue;
        if (grid[jj * gn + ii] > 0.7) return true;
      }
    }
    return false;
  }

  /* True when no 8-neighbour of k is passable at this inflation. */
  function boxedIn(grid, gn, k, inflate) {
    const n = gn, i0 = k % n, j0 = (k - i0) / n;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i0 + di, jj = j0 + dj;
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      if (!blocked(grid, n, jj * n + ii, inflate)) return false;
    }
    return true;
  }

  /* Snap a blocked target cell to the nearest passable cell, searching ring by
     ring (Chebyshev distance) up to maxCells. A known-free cell (log-odds
     < −0.7) on a ring beats an merely unblocked unknown one. Mirrors
     _nearest_free in the Python astar.py. Returns -1 when nothing qualifies. */
  function freeNear(grid, gn, k0, maxCells, inflate) {
    if (k0 < 0) return -1;
    if (!blocked(grid, gn, k0, inflate)) return k0;
    const n = gn, i0 = k0 % n, j0 = (k0 - i0) / n;
    for (let r = 1; r <= maxCells; r++) {
      let best = -1, bestKnown = -1;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;   // ring only
        const ii = i0 + di, jj = j0 + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const k = jj * n + ii;
        if (blocked(grid, n, k, inflate)) continue;
        if (grid[k] < -0.7) { bestKnown = k; break; }               // known free — best
        if (best === -1) best = k;
      }
      if (bestKnown !== -1) return bestKnown;
      if (best !== -1) return best;
    }
    return -1;
  }

  /* Nearest known-free cell with at least two unknown 8-neighbours, beyond
     minDist from the pose and inside the arena half-span. Returns -1 when the
     map has no frontier left (exploration complete). */
  function pickFrontier(grid, gn, go, res, pose, center, half, minDist, inflate) {
    const n = gn, best = { k: -1, d: Infinity };
    for (let k = 0; k < grid.length; k++) {
      if (grid[k] >= -0.7) continue;                              // must be known-free
      const i = k % n, j = (k - i) / n;
      let unknown = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const g = grid[jj * n + ii];
        if (g > -0.7 && g < 0.7) unknown++;
      }
      if (unknown < 2) continue;
      const [x, y] = cellCenter(k, go, res, n);
      if (Math.abs(x - center[0]) > half || Math.abs(y - center[1]) > half) continue;
      const d = Math.hypot(x - pose.x, y - pose.y);
      if (d < minDist || d >= best.d) continue;
      if (blocked(grid, n, k, inflate)) continue;
      best.k = k; best.d = d;
    }
    return best.k;
  }

  /* A* over the 8-connected grid, Euclidean heuristic, diagonal steps cost
     1.414·res. Blocked cells are never expanded except the goal itself — the
     caller snaps goals with freeNear, and the mission targets are pillars
     whose own cell is permanently lethal. Returns a list of [x, y] world
     points start→goal, or null when unreachable. */
  function astar(grid, gn, go, res, startK, goalK, inflate) {
    const n = gn, total = n * n;
    const g = new Float32Array(total).fill(Infinity);
    const from = new Int32Array(total).fill(-1);
    const open = [startK];
    g[startK] = 0;
    const [gx, gy] = cellCenter(goalK, go, res, n);
    const h = (k) => { const [x, y] = cellCenter(k, go, res, n); return Math.hypot(x - gx, y - gy); };
    const f = new Float32Array(total).fill(Infinity);
    f[startK] = h(startK);
    const seen = new Uint8Array(total);
    let guard = 0;
    while (open.length && guard++ < 60000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === goalK) break;
      seen[cur] = 1;
      const ci = cur % n, cj = (cur - ci) / n;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = ci + di, jj = cj + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const nk = jj * n + ii;
        if (seen[nk]) continue;
        if (nk !== goalK && blocked(grid, n, nk, inflate)) continue;
        const step = (di && dj ? 1.414 : 1) * res;
        const ng = g[cur] + step;
        if (ng < g[nk]) {
          g[nk] = ng; from[nk] = cur; f[nk] = ng + h(nk);
          if (open.indexOf(nk) === -1) open.push(nk);
        }
      }
    }
    if (from[goalK] === -1 && startK !== goalK) return null;
    const pts = [];
    let k = goalK, guard2 = 0;
    while (k !== -1 && guard2++ < 5000) { pts.push(cellCenter(k, go, res, n)); k = from[k]; }
    return pts.reverse();
  }

  /* Pure pursuit bookkeeping: project the robot onto the path (searched
     forward only, so progress is monotonic and a doubling-back route cannot
     drag the carrot back), then walk the lookahead distance from that
     projection. Returns { pathI, carrot, bestD } — bestD is the distance to
     the projection, which the caller uses as the stale-plan test. */
  function trackAhead(path, pathI, x, y, carrotDist) {
    let bestI = pathI, bestD = Infinity;
    const upto = Math.min(path.length - 1, pathI + 60);
    for (let i = pathI; i <= upto; i++) {
      const d = Math.hypot(path[i][0] - x, path[i][1] - y);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    let acc = 0, carrot = path[path.length - 1];
    for (let i = bestI; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc >= carrotDist) { carrot = b; break; }
    }
    return { pathI: bestI, carrot, bestD };
  }

  /* Steering command from bearing error and front clearance. Pivot in place
     when the carrot is more than PIVOT_BEARING off the nose; scale speed by
     clearance; hard-stop and request a replan when something is within
     0.16 m ahead. Returns { v, w, replan }. */
  function pursuitCommand(bearing, frontClear, P) {
    let w = clamp(2.0 * bearing, -P.W_MAX, P.W_MAX);
    let v = Math.abs(bearing) > P.PIVOT_BEARING ? 0
      : P.V_MAX * Math.cos(bearing) * clamp((frontClear - 0.14) / 0.5, 0, 1);
    let replan = false;
    if (frontClear < 0.16) { v = 0; w = P.W_MAX * 0.5; replan = true; }
    return { v, w, replan };
  }

  const NavCore = {
    clamp, wrapPi,
    cellOf, cellCenter, integrate,
    blocked, boxedIn, freeNear, pickFrontier, astar,
    trackAhead, pursuitCommand,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = NavCore;
  root.NavCore = NavCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
