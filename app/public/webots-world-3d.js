/* <webots-world-3d src="…world.json"> — renders a parsed Webots .wbt world in Three.js and
   runs a live exploration loop over it (2-D LIDAR → occupancy grid → frontier goal → A* →
   pure-pursuit drive), mirroring the architecture of the project's Python controllers.
   Real parameters lifted from mak_04_controller/config.py.

   Webots is Z-up: three(x,y,z) = (wx, wz, -wy); a world yaw about +Z maps to +Y in three.
   Attributes: src, playing, speed, lidar, fpv, path, accent.
   Events: 'twin-ready', 'world-loaded', 'sim-state' (≈5 Hz). */
(function () {
  const THREE_URL = '/vendor/three.min.js';
  const THREE_URL_FALLBACK = 'https://unpkg.com/three@0.147.0/build/three.min.js';
  const ORBIT_URL = '/vendor/OrbitControls.js';
  const ORBIT_URL_FALLBACK = 'https://unpkg.com/three@0.147.0/examples/js/controls/OrbitControls.js';
  let loader = null;
  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('failed ' + src));
    document.head.appendChild(s);
  });
  const loadThree = () => (window.THREE && window.THREE.OrbitControls)
    ? Promise.resolve()
    : (loader = loader || loadScript(THREE_URL).catch(() => loadScript(THREE_URL_FALLBACK))
        .then(() => loadScript(ORBIT_URL).catch(() => loadScript(ORBIT_URL_FALLBACK))));

  // ── controller constants (mak_04_controller/config.py)
  const P = {
    V_MAX: 0.35, W_MAX: 2.2,
    ROBOT_RADIUS: 0.128, HALF_WIDTH: 0.116,
    LIDAR_Z: 0.10, LIDAR_MAX: 5.0, LIDAR_RAYS: 120, SCAN_HZ: 10,
    RES: 0.05, GOAL_TOL: 0.16, FRONTIER_MIN_DIST: 0.30,
    CARROT: 0.42, PIVOT_BEARING: 0.6, REPLAN_S: 3.0,
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  class WebotsWorld3D extends HTMLElement {
    static get observedAttributes() { return ['src', 'playing', 'speed', 'lidar', 'fpv', 'path', 'accent', 'reset']; }

    constructor() {
      super();
      this._playing = true; this._speed = 1; this._simTime = 0;
    }

    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      Object.assign(this.style, { display: 'block', position: 'relative', width: '100%', height: '100%' });
      this._fpvFrame = document.createElement('div');
      Object.assign(this._fpvFrame.style, {
        position: 'absolute', top: '14px', right: '14px', borderRadius: '10px',
        border: '1px solid rgba(255,255,255,.18)', boxShadow: '0 18px 36px -14px rgba(0,0,0,.7)',
        pointerEvents: 'none', display: 'none', overflow: 'hidden',
      });
      this._fpvLabel = document.createElement('div');
      Object.assign(this._fpvLabel.style, {
        position: 'absolute', left: '0', bottom: '0', right: '0', padding: '4px 8px',
        font: '400 9.5px "JetBrains Mono", monospace', letterSpacing: '.12em', color: '#cfe6ff',
        background: 'linear-gradient(transparent, rgba(5,7,13,.85))',
      });
      this._fpvLabel.textContent = 'ROSBOT POV · RGB CAM';
      this._fpvFrame.appendChild(this._fpvLabel);
      this.appendChild(this._fpvFrame);
      loadThree().then(() => this._init()).then(() => this._load()).catch((e) => {
        console.error('[world]', e);
        this.dispatchEvent(new CustomEvent('twin-error', { detail: { message: String(e && e.message || e) }, bubbles: true, composed: true }));
      });
    }

    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      if (this._renderer) this._renderer.dispose();
    }

    attributeChangedCallback(n, o, v) {
      if (n === 'src' && o && o !== v && this._scene) this._load();
      if (n === 'playing') this._playing = v !== '0' && v !== 'false' && v !== null;
      if (n === 'speed') this._speed = parseFloat(v) || 1;
      if (n === 'lidar' && this._lidarGroup) this._lidarGroup.visible = v !== '0' && v !== 'false';
      if (n === 'path' && this._pathGroup) this._pathGroup.visible = v !== '0' && v !== 'false';
      if (n === 'fpv') this._setFpv(v !== '0' && v !== 'false' && v !== null);
      if (n === 'accent' && this._root) this._load();
      if (n === 'reset' && o !== null && o !== v && this._world) this.reset();
    }

    _setFpv(on) {
      this._fpv = on;
      if (this._fpvFrame) this._fpvFrame.style.display = on ? 'block' : 'none';
      this._layoutFpv();
    }

    _layoutFpv() {
      if (!this._fpvFrame) return;
      const w = Math.round(Math.min(Math.max(this.clientWidth * 0.28, 180), 330));
      const h = Math.round(w * 0.62);
      this._fpvRect = { w, h, top: 14, right: 14 };
      this._fpvFrame.style.width = w + 'px';
      this._fpvFrame.style.height = h + 'px';
    }

    _init() {
      const T = window.THREE;
      const r = this._renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setPixelRatio(Math.min(devicePixelRatio, 2));
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
      r.outputEncoding = T.sRGBEncoding;
      r.autoClear = false;
      Object.assign(r.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', cursor: 'grab' });
      this.insertBefore(r.domElement, this._fpvFrame);

      const scene = this._scene = new T.Scene();
      scene.fog = new T.Fog(0x05070d, 14, 34);
      const cam = this._cam = new T.PerspectiveCamera(40, 16 / 9, 0.05, 200);
      cam.position.set(5.5, 6.5, 7.5);
      const ctl = this._ctl = new T.OrbitControls(cam, r.domElement);
      ctl.target.set(0, 0.3, 0);
      ctl.enableDamping = true; ctl.dampingFactor = 0.07;
      ctl.minDistance = 1.2; ctl.maxDistance = 26; ctl.maxPolarAngle = Math.PI / 2.05;

      this._fpvCam = new T.PerspectiveCamera(74, 1.6, 0.02, 60);

      scene.add(new T.HemisphereLight(0x9ab7e8, 0x05070d, 0.5));
      const key = new T.DirectionalLight(0xffffff, 0.95);
      key.position.set(6, 9, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
      const s = key.shadow.camera; s.left = -7; s.right = 7; s.top = 7; s.bottom = -7; s.near = 0.5; s.far = 30;
      scene.add(key);
      const fill = new T.DirectionalLight(0x5ea2ff, 0.45); fill.position.set(-6, 4, -5); scene.add(fill);

      this._ray = new T.Raycaster(); this._ray.far = P.LIDAR_MAX;
      this._ro = new ResizeObserver(() => { this._resize(); this._layoutFpv(); });
      this._ro.observe(this);
      this._resize(); this._layoutFpv();
      this._clock = performance.now();
      this._loop();
    }

    _resize() {
      if (!this._renderer) return;
      const w = this.clientWidth || 640, h = this.clientHeight || 360;
      this._renderer.setSize(w, h, false);
      this._cam.aspect = w / Math.max(h, 1); this._cam.updateProjectionMatrix();
    }

    async _load() {
      const src = this.getAttribute('src');
      if (!src) return;
      const world = this._world = await fetch(src).then((r) => r.json());
      this._build(world);
      this.reset();
      this.dispatchEvent(new CustomEvent('world-loaded', {
        detail: { name: world.name, solids: world.solids.length, controller: world.controller },
        bubbles: true, composed: true,
      }));
    }

    // ────────────────────────────────────────────── scene
    _build(world) {
      const T = window.THREE;
      if (this._root) this._scene.remove(this._root);
      const root = this._root = new T.Group();
      this._scene.add(root);
      this._walls = [];

      const accent = this._accent = new T.Color(this.getAttribute('accent') || '#22d3ee');
      const mat = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75, metalness: 0.08 }, o || {}));
      const woodMat = mat(0xb98a58, { roughness: 0.88, metalness: 0.03 });

      const c = world.center || [0, 0];
      const cx = c[0], cy = c[1];               // maze centre in Webots XY
      const span = Math.max(world.span || 6, 4);
      const size = span + 2.4;
      this._center = [cx, cy];

      const floor = new T.Mesh(new T.PlaneGeometry(size, size), mat(0x121722, { roughness: 0.95 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, 0, -cy);
      floor.receiveShadow = true; root.add(floor);
      const grid = new T.GridHelper(size, Math.round(size * 2), 0x243349, 0x182133);
      grid.position.set(cx, 0.004, -cy); root.add(grid);

      for (const so of world.solids) {
        const [wx, wy, wz] = so.pos;
        const yaw = so.rot && Math.abs(so.rot[2]) > 0.5 ? so.rot[3] * Math.sign(so.rot[2]) : 0;
        let mesh;
        if (so.box) {
          const [sx, sy, sz] = so.box;
          const isPad = sz <= 0.12;
          const col = so.color ? new T.Color(so.color[0], so.color[1], so.color[2]) : null;
          mesh = new T.Mesh(new T.BoxGeometry(sx, sz, sy),
            isPad && col ? new T.MeshStandardMaterial({ color: col, roughness: 0.6, emissive: col.clone().multiplyScalar(0.2) }) : woodMat);
          mesh.position.set(wx, isPad ? 0.03 : wz, -wy);
          if (!isPad) this._walls.push(mesh);
        } else if (so.cyl) {
          const [h, rad] = so.cyl;
          const col = so.color ? new T.Color(so.color[0], so.color[1], so.color[2]) : accent;
          mesh = new T.Mesh(new T.CylinderGeometry(rad, rad, h, 24),
            new T.MeshStandardMaterial({ color: col, roughness: 0.5, emissive: col.clone().multiplyScalar(0.25) }));
          mesh.position.set(wx, wz, -wy);
          this._walls.push(mesh);
        } else continue;
        mesh.rotation.y = yaw;
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.name = so.name;
        root.add(mesh);
      }

      this._buildRobot(root, accent, mat);
      this._buildOverlays(root, accent);

      // frame the maze
      this._ctl.target.set(cx, 0.3, -cy);
      const d = span * 1.15;
      this._cam.position.set(cx + d * 0.5, d * 0.8, -cy + d * 0.8);
      this._ctl.maxDistance = d * 2.6;
    }

    _buildRobot(root, accent, mat) {
      const T = window.THREE;
      const rb = this._robot = new T.Group();      // true Rosbot scale: 0.232 m wide
      root.add(rb);
      const shell = mat(0x2f394d, { roughness: 0.55, metalness: 0.25 });
      const dark = mat(0x11151c, { roughness: 0.9 });

      const chassis = new T.Mesh(new T.BoxGeometry(0.2, 0.075, 0.235), shell);
      chassis.position.y = 0.082; chassis.castShadow = true; rb.add(chassis);
      const skirt = new T.Mesh(new T.BoxGeometry(0.212, 0.02, 0.245), dark);
      skirt.position.y = 0.045; rb.add(skirt);
      const deck = new T.Mesh(new T.BoxGeometry(0.196, 0.014, 0.226), mat(0x8d99ad, { metalness: 0.55, roughness: 0.35 }));
      deck.position.y = 0.127; deck.castShadow = true; rb.add(deck);
      const bumper = new T.Mesh(new T.BoxGeometry(0.19, 0.028, 0.016), mat(0xd8dee9, { metalness: 0.3, roughness: 0.5 }));
      bumper.position.set(0, 0.075, 0.126); rb.add(bumper);

      const mast = new T.Mesh(new T.BoxGeometry(0.018, 0.07, 0.018), dark);
      mast.position.set(0, 0.168, -0.06); rb.add(mast);
      const camBody = new T.Mesh(new T.BoxGeometry(0.085, 0.024, 0.02), dark);
      camBody.position.set(0, 0.207, -0.052); rb.add(camBody);
      for (const dx of [-0.026, 0.026]) {
        const lens = new T.Mesh(new T.CylinderGeometry(0.0065, 0.0065, 0.006, 14),
          new T.MeshStandardMaterial({ color: 0x1b3b6f, emissive: 0x0d2244, roughness: 0.25 }));
        lens.rotation.x = Math.PI / 2; lens.position.set(dx, 0.207, -0.041); rb.add(lens);
      }

      const lidarBase = new T.Mesh(new T.CylinderGeometry(0.03, 0.034, 0.014, 22), dark);
      lidarBase.position.y = P.LIDAR_Z - 0.008; rb.add(lidarBase);
      this._lidarHead = new T.Mesh(new T.CylinderGeometry(0.028, 0.028, 0.026, 22),
        new T.MeshStandardMaterial({ color: accent, emissive: accent.clone().multiplyScalar(0.55), roughness: 0.35 }));
      this._lidarHead.position.y = P.LIDAR_Z + 0.012; rb.add(this._lidarHead);

      this._wheels = [];
      for (const [dx, dz] of [[-0.11, -0.082], [0.11, -0.082], [-0.11, 0.082], [0.11, 0.082]]) {
        const w = new T.Mesh(new T.CylinderGeometry(0.043, 0.043, 0.03, 20), dark);
        w.rotation.z = Math.PI / 2; w.position.set(dx, 0.043, dz); w.castShadow = true; rb.add(w);
        const hub = new T.Mesh(new T.CylinderGeometry(0.017, 0.017, 0.033, 12), mat(0xc0c7d2, { metalness: 0.6, roughness: 0.35 }));
        hub.rotation.z = Math.PI / 2; hub.position.set(dx, 0.043, dz); rb.add(hub);
        this._wheels.push(w);
      }

      const arrow = new T.Mesh(new T.ConeGeometry(0.03, 0.075, 16),
        new T.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9 }));
      arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 0.055, 0.185); rb.add(arrow);

      this._poseRing = new T.Mesh(new T.RingGeometry(0.16, 0.185, 40),
        new T.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.45, side: T.DoubleSide }));
      this._poseRing.rotation.x = -Math.PI / 2; this._poseRing.position.y = 0.008; root.add(this._poseRing);

      this._fpvCam.position.set(0, 0.207, 0.02);
      this._fpvCam.rotation.set(0, Math.PI, 0);   // model front is local +Z; cameras look down −Z
      rb.add(this._fpvCam);
    }

    _buildOverlays(root, accent) {
      const T = window.THREE;
      const N = P.LIDAR_RAYS;

      this._lidarGroup = new T.Group();
      this._lidarGroup.visible = this.getAttribute('lidar') !== '0';
      root.add(this._lidarGroup);
      const lg = new T.BufferGeometry();
      lg.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 6), 3));
      this._scanLines = new T.LineSegments(lg, new T.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.22 }));
      this._lidarGroup.add(this._scanLines);
      const hg = new T.BufferGeometry();
      hg.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3), 3));
      this._hits = new T.Points(hg, new T.PointsMaterial({ color: accent, size: 0.045, transparent: true, opacity: 0.95 }));
      this._lidarGroup.add(this._hits);

      // occupancy grid point clouds
      this._occPoints = new T.Points(new T.BufferGeometry(),
        new T.PointsMaterial({ color: 0xff8a3d, size: P.RES * 1.1, transparent: true, opacity: 0.95 }));
      this._freePoints = new T.Points(new T.BufferGeometry(),
        new T.PointsMaterial({ color: 0x4d7fbf, size: P.RES * 0.9, transparent: true, opacity: 0.3 }));
      root.add(this._occPoints); root.add(this._freePoints);

      // planned path + goal marker
      this._pathGroup = new T.Group();
      this._pathGroup.visible = this.getAttribute('path') !== '0';
      root.add(this._pathGroup);
      const pg = new T.BufferGeometry();
      pg.setAttribute('position', new T.BufferAttribute(new Float32Array(1200 * 3), 3));
      this._pathLine = new T.Line(pg, new T.LineBasicMaterial({ color: 0x86ff9f, transparent: true, opacity: 0.9 }));
      this._pathLine.frustumCulled = false;
      this._pathGroup.add(this._pathLine);
      this._goalMark = new T.Mesh(new T.CylinderGeometry(0.055, 0.055, 0.28, 16),
        new T.MeshBasicMaterial({ color: 0x86ff9f, transparent: true, opacity: 0.4 }));
      this._goalMark.visible = false; this._pathGroup.add(this._goalMark);
    }

    // ────────────────────────────────────────────── sim
    reset() {
      const w = this._world;
      if (!w) return;
      const rp = (w.robot && w.robot.pos) || [0, 0, 0];
      const rr = w.robot && w.robot.rot;
      this._pose = { x: rp[0], y: rp[1], th: rr ? rr[3] * Math.sign(rr[2] || 1) : 0 };
      this._v = 0; this._w = 0; this._simTime = 0; this._dist = 0;
      this._state = 'INIT_SCAN'; this._spun = 0;
      this._path = null; this._goal = null; this._replanIn = 0;
      this._scanAcc = 0; this._scan = new Float32Array(P.LIDAR_RAYS);
      this._reached = { blue: false, yellow: false };

      // mission targets: blue pillar first, then yellow (as in the Python controllers)
      const cyl = (w.solids || []).filter((s) => s.cyl && s.color);
      const pick = (f) => { const s = cyl.find(f); return s ? [s.pos[0], s.pos[1]] : null; };
      this._targets = {
        blue: pick((s) => s.color[2] > 0.5 && s.color[0] < 0.4),
        yellow: pick((s) => s.color[0] > 0.5 && s.color[1] > 0.5 && s.color[2] < 0.4),
      };

      const span = Math.max(w.span || 6, 4) + 2.4;
      this._gn = Math.ceil(span / P.RES);
      this._go = [this._center[0] - span / 2, this._center[1] - span / 2];
      this._grid = new Float32Array(this._gn * this._gn);   // log-odds
      this._ensureOpenSpawn();
      this._syncRobot();
      this._pushState(true);
    }

    /* How open is a candidate pose? Casts a coarse fan and reports the longest
       sightline and the nearest obstacle. Used only at load time. */
    _openness(x, y) {
      const T = window.THREE;
      const origin = new T.Vector3(x, P.LIDAR_Z, -y);
      const dir = new T.Vector3();
      let maxd = 0, clear = Infinity;
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        dir.set(Math.cos(a), 0, -Math.sin(a));
        this._ray.set(origin, dir);
        const hit = this._ray.intersectObjects(this._walls, false)[0];
        const d = hit ? hit.distance : P.LIDAR_MAX;
        if (d > maxd) maxd = d;
        if (d < clear) clear = d;
      }
      return { maxd, clear };
    }

    /* Maze 4's exported geometry seals the robot's start pose inside a closed
       ~1 m pocket — 0 of 120 rays escape, so no plan can ever leave it and the
       robot sits at 0.00 m forever. That is a defect in the .wbt export, not in
       the controller, so rather than silently failing we detect the enclosure
       and move the spawn to the nearest genuinely open pose. The relocation is
       reported in sim-state so the UI can say the run does not start where the
       Webots world does. Nothing in the original project is touched. */
    _ensureOpenSpawn() {
      this._spawnMoved = null;
      if (!this._walls || !this._walls.length || !this._ray) return;
      /* reset() runs before the first render, so the wall meshes still carry
         stale world matrices — without this every probe ray misses and the
         pocket looks wide open. */
      this._scene.updateMatrixWorld(true);
      const OPEN = P.LIDAR_MAX * 0.5;
      if (this._openness(this._pose.x, this._pose.y).maxd >= OPEN) return;

      const span = Math.max((this._world && this._world.span) || 6, 4);
      const half = span / 2;
      for (let r = 0.4; r <= half * 1.4; r += 0.2) {
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const x = this._pose.x + Math.cos(a) * r;
          const y = this._pose.y + Math.sin(a) * r;
          if (Math.abs(x - this._center[0]) > half || Math.abs(y - this._center[1]) > half) continue;
          const o = this._openness(x, y);
          if (o.clear > P.ROBOT_RADIUS * 2.2 && o.maxd >= OPEN) {
            this._spawnMoved = {
              from: [+this._pose.x.toFixed(2), +this._pose.y.toFixed(2)],
              to: [+x.toFixed(2), +y.toFixed(2)], by: +r.toFixed(2),
            };
            this._pose.x = x; this._pose.y = y;
            return;
          }
        }
      }
      this._spawnMoved = { sealed: true };
    }

    _cell(x, y) {
      const i = Math.floor((x - this._go[0]) / P.RES);
      const j = Math.floor((y - this._go[1]) / P.RES);
      return (i < 0 || j < 0 || i >= this._gn || j >= this._gn) ? -1 : j * this._gn + i;
    }
    _cellCenter(k) {
      const i = k % this._gn, j = (k - i) / this._gn;
      return [this._go[0] + (i + 0.5) * P.RES, this._go[1] + (j + 0.5) * P.RES];
    }

    _scanNow() {
      const T = window.THREE;
      const N = P.LIDAR_RAYS;
      const origin = new T.Vector3(this._pose.x, P.LIDAR_Z, -this._pose.y);
      const dir = new T.Vector3();
      const lp = this._scanLines.geometry.attributes.position;
      const hp = this._hits.geometry.attributes.position;
      for (let i = 0; i < N; i++) {
        const a = this._pose.th + (i / N) * Math.PI * 2;
        // Webots XY heading → three XZ direction
        dir.set(Math.cos(a), 0, -Math.sin(a));
        this._ray.set(origin, dir);
        const hit = this._ray.intersectObjects(this._walls, false)[0];
        const d = hit ? hit.distance : P.LIDAR_MAX;
        this._scan[i] = hit ? d : Infinity;
        const ex = this._pose.x + Math.cos(a) * d, ey = this._pose.y + Math.sin(a) * d;
        lp.setXYZ(i * 2, origin.x, origin.y, origin.z);
        lp.setXYZ(i * 2 + 1, ex, origin.y, -ey);
        hp.setXYZ(i, ex, hit ? origin.y : -20, -ey);
        this._integrate(a, d, !!hit);
      }
      lp.needsUpdate = true; hp.needsUpdate = true;
      this._rebuildCloud();
    }

    _integrate(a, d, hitWall) {
      const step = P.RES * 0.7;
      const free = Math.max(d - P.RES * 1.6, 0);
      for (let t = 0.05; t < free; t += step) {
        const k = this._cell(this._pose.x + Math.cos(a) * t, this._pose.y + Math.sin(a) * t);
        if (k >= 0 && this._grid[k] <= 0.5) this._grid[k] = Math.max(this._grid[k] - 0.35, -3);  // occupied cells latch (OCC_CONFIRM)
      }
      if (hitWall && d < P.LIDAR_MAX) {
        const k = this._cell(this._pose.x + Math.cos(a) * d, this._pose.y + Math.sin(a) * d);
        if (k >= 0) this._grid[k] = Math.min(this._grid[k] + 1.3, 4);
      }
    }

    _rebuildCloud() {
      const occ = [], free = [];
      for (let k = 0; k < this._grid.length; k++) {
        const g = this._grid[k];
        if (g > 0.7) { const [x, y] = this._cellCenter(k); occ.push(x, 0.04, -y); }
        else if (g < -0.7) { const [x, y] = this._cellCenter(k); free.push(x, 0.012, -y); }
      }
      const T = window.THREE;
      this._occPoints.geometry.dispose();
      this._occPoints.geometry = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(occ, 3));
      this._freePoints.geometry.dispose();
      this._freePoints.geometry = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(free, 3));
      this._occCount = occ.length / 3; this._freeCount = free.length / 3;
    }

    /* Occupancy test with the robot radius inflated. `cells` lets the planner
       relax the inflation when the robot is boxed in by its own halo — without
       that escape hatch a start pose within one robot radius of a wall has no
       passable neighbour at all and A* can never expand. */
    _blocked(k, cells) {
      const inflate = cells === undefined ? Math.ceil(P.ROBOT_RADIUS / P.RES) : cells;
      const i = k % this._gn, j = (k - i) / this._gn;
      for (let dj = -inflate; dj <= inflate; dj++) {
        for (let di = -inflate; di <= inflate; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= this._gn || jj >= this._gn) continue;
          if (this._grid[jj * this._gn + ii] > 0.7) return true;
        }
      }
      return false;
    }

    /* The mission targets are the pillars themselves, and a pillar cell is
       surrounded by its own inflated halo — so it is never enterable. Aim at
       the nearest passable cell around it instead, which is what the Python
       controller does implicitly by driving to within GOAL_TOL of the post. */
    /* True when no 8-neighbour of k is passable at this inflation. */
    _boxedIn(k, inflate) {
      const n = this._gn, i0 = k % n, j0 = (k - i0) / n;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i0 + di, jj = j0 + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        if (!this._blocked(jj * n + ii, inflate)) return false;
      }
      return true;
    }

    _freeNear(k0, maxCells, inflate) {
      if (k0 < 0) return -1;
      if (!this._blocked(k0, inflate)) return k0;
      const n = this._gn, i0 = k0 % n, j0 = (k0 - i0) / n;
      for (let r = 1; r <= maxCells; r++) {
        let best = -1, bestKnown = -1;
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;   // ring only
          const ii = i0 + di, jj = j0 + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const k = jj * n + ii;
          if (this._blocked(k, inflate)) continue;
          if (this._grid[k] < -0.7) { bestKnown = k; break; }         // known free — best
          if (best === -1) best = k;
        }
        if (bestKnown !== -1) return bestKnown;
        if (best !== -1) return best;
      }
      return -1;
    }

    _pickFrontier() {
      const n = this._gn, best = { k: -1, d: Infinity };
      const half = Math.max(this._world.span || 6, 4) / 2 + 0.3;   // stay inside the arena
      for (let k = 0; k < this._grid.length; k++) {
        if (this._grid[k] >= -0.7) continue;                     // must be known-free
        const i = k % n, j = (k - i) / n;
        let unknown = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const g = this._grid[jj * n + ii];
          if (g > -0.7 && g < 0.7) unknown++;
        }
        if (unknown < 2) continue;
        const [x, y] = this._cellCenter(k);
        if (Math.abs(x - this._center[0]) > half || Math.abs(y - this._center[1]) > half) continue;
        const d = Math.hypot(x - this._pose.x, y - this._pose.y);
        if (d < P.FRONTIER_MIN_DIST || d >= best.d) continue;
        if (this._blocked(k)) continue;
        best.k = k; best.d = d;
      }
      return best.k;
    }

    _astar(startK, goalK, inflate) {
      const n = this._gn, total = n * n;
      const g = new Float32Array(total).fill(Infinity);
      const from = new Int32Array(total).fill(-1);
      const open = [startK];
      g[startK] = 0;
      const [gx, gy] = this._cellCenter(goalK);
      const h = (k) => { const [x, y] = this._cellCenter(k); return Math.hypot(x - gx, y - gy); };
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
          if (nk !== goalK && this._blocked(nk, inflate)) continue;
          const step = (di && dj ? 1.414 : 1) * P.RES;
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
      while (k !== -1 && guard2++ < 5000) { pts.push(this._cellCenter(k)); k = from[k]; }
      return pts.reverse();
    }

    _missionTarget() {
      if (!this._reached.blue && this._targets.blue) return { key: 'blue', xy: this._targets.blue };
      if (!this._reached.yellow && this._targets.yellow) return { key: 'yellow', xy: this._targets.yellow };
      return null;
    }

    _replan() {
      const startK = this._cell(this._pose.x, this._pose.y);
      this._replanIn = P.REPLAN_S;
      const target = this._missionTarget();
      const full = Math.ceil(P.ROBOT_RADIUS / P.RES);

      if (startK < 0) {
        this._path = null; this._goal = null; this._goalMark.visible = false;
        this._state = 'SEARCH';
        return;
      }

      /* If the robot's own cell is inside the inflated halo of a nearby wall,
         every neighbour fails the full-radius test and A* expands nothing —
         the robot then sits at 0.00 m forever. Shrink the inflation just
         enough to get moving; the front-clearance gate in _drive still stops
         it from driving into anything. */
      let inflate = full;
      while (inflate > 0 && this._boxedIn(startK, inflate)) inflate -= 1;

      const plan = (gk) => {
        if (gk < 0) return null;
        const pth = this._astar(startK, gk, inflate);
        return pth && pth.length >= 2 ? pth : null;
      };

      let goalK = -1, path = null, exploring = false;

      if (target) {
        // Aim beside the pillar, not at its (permanently blocked) centre.
        const pillar = this._cell(target.xy[0], target.xy[1]);
        goalK = this._freeNear(pillar, 12, inflate);
        path = plan(goalK);
      }

      // No mission target, or the target is unreachable right now — explore
      // instead of latching into SEARCH and standing still.
      if (!path) {
        const fk = this._pickFrontier();
        const fpath = plan(fk);
        if (fpath) { goalK = fk; path = fpath; exploring = true; }
      }

      if (!path) {
        this._path = null; this._goal = null; this._goalMark.visible = false;
        this._state = target ? 'SEARCH' : 'MISSION_DONE';
        return;
      }

      this._path = path; this._pathI = 0;
      this._goal = this._cellCenter(goalK);
      this._state = (target && !exploring) ? 'GOTO_' + target.key.toUpperCase() : 'EXPLORE';
      this._goalMark.visible = true;
      this._goalMark.position.set(this._goal[0], 0.14, -this._goal[1]);
      const pos = this._pathLine.geometry.attributes.position;
      const m = Math.min(path.length, 1200);
      for (let i = 0; i < pos.count; i++) {
        const p = path[Math.min(i, m - 1)];
        pos.setXYZ(i, p[0], 0.03, -p[1]);
      }
      pos.needsUpdate = true;
    }

    _drive(dt) {
      const pose = this._pose;
      if (this._state === 'INIT_SCAN') {                     // one spin in place to seed the map
        this._w = 1.2; this._v = 0;
        this._spun += this._w * dt;
        if (this._spun >= Math.PI * 2) { this._spun = 0; this._replan(); }
      } else if (this._state === 'UNSTICK') {
        /* Recovery. The Python controller has one; this port did not, so once
           the robot wedged itself against a wall it stayed there until the
           3-second replan timer happened to free it. Back out along a gentle
           arc, then force a fresh plan. */
        this._v = -P.V_MAX * 0.45;
        this._w = this._unstickSign * P.W_MAX * 0.55;
        this._unstickT -= dt;
        if (this._unstickT <= 0) { this._state = 'EXPLORE'; this._replanIn = 0; this._stuckT = 0; }
      } else if (this._path) {
        /* Pure pursuit, done properly.
         *
         * The previous version tracked progress by waiting for a path node to
         * come within RES*2 (0.10 m) of the robot, and measured the lookahead
         * arc from that index. But pure pursuit deliberately cuts corners, so
         * the robot routinely passes 0.15-0.25 m from a grid-centre node and
         * the index never advanced. The carrot was then measured 0.42 m along
         * the path from a point already behind the robot: the bearing error
         * swung past PIVOT_BEARING, forward speed was forced to zero, and it
         * pivoted on the spot until REPLAN_S fired and the cycle repeated.
         * That is the stall-spin-lurch behaviour, and it is why the web run
         * never looked like the Webots run.
         *
         * Correct pure pursuit projects the robot onto the path first, then
         * measures the lookahead from that projection. */
        const path = this._path;

        // 1. nearest point on the path, searched forward only, so progress is
        //    monotonic and a doubling-back route cannot drag the carrot back
        let bestI = this._pathI, bestD = Infinity;
        const upto = Math.min(path.length - 1, this._pathI + 60);
        for (let i = this._pathI; i <= upto; i++) {
          const d = Math.hypot(path[i][0] - pose.x, path[i][1] - pose.y);
          if (d < bestD) { bestD = d; bestI = i; }
        }
        this._pathI = bestI;

        // 2. walk forward from the projection by the lookahead distance
        let acc = 0, carrot = path[path.length - 1];
        for (let i = bestI; i < path.length - 1; i++) {
          const a = path[i], b = path[i + 1];
          acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (acc >= P.CARROT) { carrot = b; break; }
        }

        const bearing = wrapPi(Math.atan2(carrot[1] - pose.y, carrot[0] - pose.x) - pose.th);
        const frontClear = this._frontClear();
        this._w = clamp(2.0 * bearing, -P.W_MAX, P.W_MAX);
        this._v = Math.abs(bearing) > P.PIVOT_BEARING ? 0
          : P.V_MAX * Math.cos(bearing) * clamp((frontClear - 0.14) / 0.5, 0, 1);
        if (frontClear < 0.16) { this._v = 0; this._w = P.W_MAX * 0.5; this._replanIn = 0; }

        /* Drifted far off the route? The plan is stale — replan rather than
           chase a carrot on a path we are no longer following. */
        if (bestD > 0.6) this._replanIn = 0;
        const tg = this._missionTarget();
        if (tg && Math.hypot(tg.xy[0] - pose.x, tg.xy[1] - pose.y) < 0.36) {
          this._reached[tg.key] = true;
          this._replanIn = 0;
          if (!this._missionTarget()) { this._state = 'MISSION_DONE'; this._path = null; this._goalMark.visible = false; }
        } else if (this._goal && Math.hypot(this._goal[0] - pose.x, this._goal[1] - pose.y) < P.GOAL_TOL) this._replanIn = 0;
      } else {
        this._v = 0; this._w = this._state === 'MISSION_DONE' ? 0 : 0.9;
      }

      this._replanIn -= dt;
      if (this._replanIn <= 0 && this._state !== 'INIT_SCAN') this._replan();

      pose.th = wrapPi(pose.th + this._w * dt);
      const step = this._v * dt;
      const nx = pose.x + Math.cos(pose.th) * step, ny = pose.y + Math.sin(pose.th) * step;
      /* Reversing during recovery must not be blocked by the forward-clearance
         gate — that was what made a wedged robot unable to free itself. */
      if (step < 0 || this._frontClear() > 0.13) { pose.x = nx; pose.y = ny; this._dist += Math.abs(step); }

      /* Stuck detector. Anything that is supposed to be driving but has moved
         less than 6 cm in 2.5 s is wedged; hand it to the recovery state. */
      if (this._state !== 'INIT_SCAN' && this._state !== 'MISSION_DONE' && this._state !== 'UNSTICK') {
        const moved = Math.hypot(pose.x - (this._lastX ?? pose.x), pose.y - (this._lastY ?? pose.y));
        this._stuckT = (this._stuckT || 0) + dt;
        if (this._stuckT > 2.5) {
          if (moved < 0.06) {
            this._state = 'UNSTICK';
            this._unstickT = 1.1;
            // turn away from whichever side has more room
            this._unstickSign = this._sideClear(+1) >= this._sideClear(-1) ? 1 : -1;
            this._path = null;
          }
          this._stuckT = 0; this._lastX = pose.x; this._lastY = pose.y;
        }
      }
      this._syncRobot();
      for (const w of this._wheels) w.rotation.x += (this._v / 0.043) * dt;
    }

    _frontClear() {
      const N = P.LIDAR_RAYS, span = Math.round(N * 0.08);   // ±~30°
      let min = Infinity;
      for (let i = -span; i <= span; i++) {
        const d = this._scan[(i + N) % N];
        if (d < min) min = d;
      }
      return min;
    }

    /** Clearance to one side (+1 left, -1 right); picks the escape direction. */
    _sideClear(sign) {
      const N = P.LIDAR_RAYS;
      const centre = Math.round((sign > 0 ? 0.25 : 0.75) * N);
      const span = Math.round(N * 0.06);
      let min = Infinity;
      for (let i = centre - span; i <= centre + span; i++) {
        const d = this._scan[(i + N) % N];
        if (d < min) min = d;
      }
      return min;
    }

    _syncRobot() {
      if (!this._robot) return;
      this._robot.position.set(this._pose.x, 0, -this._pose.y);
      this._robot.rotation.y = this._pose.th + Math.PI / 2;   // model is authored front-at-+Z; motion model uses +X
      this._poseRing.position.set(this._pose.x, 0.008, -this._pose.y);
    }

    _pushState(force) {
      const known = (this._occCount || 0) + (this._freeCount || 0);
      const total = this._grid ? this._grid.length : 1;
      this.dispatchEvent(new CustomEvent('sim-state', {
        detail: {
          state: this._state, simTime: this._simTime, dist: this._dist,
          v: this._v, w: this._w, pose: [this._pose.x, this._pose.y, this._pose.th],
          occ: this._occCount || 0, coverage: known / total,
          pathLen: this._path ? this._path.length : 0,
          goal: this._goal, playing: this._playing, force: !!force,
          spawnMoved: this._spawnMoved || null,
          blue: this._reached ? this._reached.blue : false,
          yellow: this._reached ? this._reached.yellow : false,
        },
        bubbles: true, composed: true,
      }));
    }

    // ────────────────────────────────────────────── loop
    _loop() {
      this._raf = requestAnimationFrame(() => this._loop());
      const now = performance.now();
      const dt = Math.min((now - this._clock) / 1000, 0.05);
      this._clock = now;

      if (this._world && this._playing) {
        const sdt = dt * this._speed;
        this._simTime += sdt;
        this._scanAcc += sdt;
        if (this._scanAcc >= 1 / P.SCAN_HZ) { this._scanAcc = 0; this._scanNow(); }
        this._drive(sdt);
        this._hudAcc = (this._hudAcc || 0) + dt;
        if (this._hudAcc > 0.2) { this._hudAcc = 0; this._pushState(); }
      }
      if (this._lidarHead) this._lidarHead.rotation.y += dt * (this._playing ? 8 : 1);
      if (this._poseRing) this._poseRing.material.opacity = 0.3 + 0.2 * Math.sin(now / 420);

      this._ctl.update();
      const r = this._renderer;
      r.clear();
      const w = this.clientWidth || 640, h = this.clientHeight || 360;
      r.setViewport(0, 0, w, h); r.setScissorTest(false);
      r.render(this._scene, this._cam);

      if (this._fpv && this._fpvRect) {
        const { w: fw, h: fh, top, right } = this._fpvRect;
        const x = w - right - fw, y = h - top - fh;
        r.setViewport(x, y, fw, fh);
        r.setScissor(x, y, fw, fh);
        r.setScissorTest(true);
        this._fpvCam.aspect = fw / fh; this._fpvCam.updateProjectionMatrix();
        r.clearDepth();
        r.render(this._scene, this._fpvCam);
        r.setScissorTest(false);
      }

      if (!this._ready && this._root) {
        this._ready = true;
        this.dispatchEvent(new CustomEvent('twin-ready', { bubbles: true, composed: true }));
      }
    }
  }

  if (!customElements.get('webots-world-3d')) customElements.define('webots-world-3d', WebotsWorld3D);
})();
