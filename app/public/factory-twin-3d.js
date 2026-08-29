/* <factory-twin-3d> — Three.js render of the Smart Tabletop Factory cell.
   Pure renderer: the host owns the clock and passes sim-time (seconds).
   Emits bubbling CustomEvents: 'twin-ready', 'twin-select' {detail:{id,name}}. */
(function () {
  const THREE_URL = '/vendor/three.min.js';
  const THREE_URL_FALLBACK = 'https://unpkg.com/three@0.147.0/build/three.min.js';
  const ORBIT_URL = '/vendor/OrbitControls.js';
  const ORBIT_URL_FALLBACK = 'https://unpkg.com/three@0.147.0/examples/js/controls/OrbitControls.js';

  let loader = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('failed ' + src));
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (window.THREE && window.THREE.OrbitControls) return Promise.resolve();
    if (!loader) loader = loadScript(THREE_URL)
      .catch(() => loadScript(THREE_URL_FALLBACK))
      .then(() => loadScript(ORBIT_URL).catch(() => loadScript(ORBIT_URL_FALLBACK)));
    return loader;
  }

  const PHASES = [
    ['idle', 1.5], ['picking', 2], ['moving', 3], ['baking', 4],
    ['cooling', 1.5], ['detecting', 1], ['sorting', 2], ['storing', 1.5],
  ];
  const TOTAL = PHASES.reduce((a, p) => a + p[1], 0);
  function phaseAt(t) {
    let x = ((t % TOTAL) + TOTAL) % TOTAL;
    for (const [name, d] of PHASES) { if (x < d) return { name, p: x / d }; x -= d; }
    return { name: 'storing', p: 1 };
  }
  const BIN_COLORS = [0xef4444, 0x22c55e, 0x3b82f6];
  window.FactoryTwinSim = { PHASES, TOTAL, phaseAt, BIN_COLORS };


  /* ──────────────────────────────────────────────────────────────────────
     fischertechnik parts library

     Everything below is dimensioned on the real fischertechnik 15 mm grid —
     the raster the kit is named after (Baustein 15, Baustein 30, Baustein
     15x30x5). One grid unit is FT scene units, so a part is placed by
     integer multiples of FT and is dimensionally correct by construction.

       1 grid unit = 15 mm = FT scene units   →   1 scene unit = 200 mm

     Material albedos were sampled from the fischertechnik 536634 reference
     photographs (k-means over the hue bands, median of each cluster, taken
     towards the shadow side because the scene adds its own lighting).
     ────────────────────────────────────────────────────────────────────── */

  const FT = 0.075;            // one 15 mm grid unit in scene units
  const MM = FT / 15;          // one millimetre

  const FT_COLORS = {
    red:        0xc2141c,      // ft signal red — sampled #d0333a..#e23f42
    redDark:    0xa8222a,      // shadowed red, used for recessed faces
    black:      0x17161a,      // black profile / structural beams
    darkGrey:   0x3d3c40,      // motor and gearbox housings
    midGrey:    0x6e7073,      // grey plastic parts
    alu:        0xb0b1b3,      // aluminium rods and extrusions
    plate:      0xdcdddd,      // base plate / table
    blue:       0x1a72b8,      // compressor
    white:      0xe8e8e6,      // white workpiece
    workRed:    0xd8323a,
    workBlue:   0x1a72b8,
    oven:       0xd8323a,      // the Brennofen shell is ft red
  };

  /* Procedural textures. Drawn once, shared by every instance — the whole
     factory is a few dozen distinct parts repeated, exactly like the kit. */
  const TEX = {};

  function slotTexture() {
    if (TEX.slot) return TEX.slot;
    const px = 128, c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    g.fillStyle = '#17161a'; g.fillRect(0, 0, px, px);
    // centre groove running the length of the beam
    g.fillStyle = '#0e0d10';
    g.fillRect(px * 0.38, 0, px * 0.24, px);
    g.fillStyle = '#232227';
    g.fillRect(px * 0.36, 0, px * 0.02, px);
    g.fillRect(px * 0.62, 0, px * 0.02, px);
    // one mounting hole per 15 mm grid step
    for (let i = 0; i < 4; i++) {
      const y = px * (0.125 + i * 0.25);
      g.beginPath(); g.arc(px * 0.5, y, px * 0.075, 0, 6.283);
      g.fillStyle = '#08070a'; g.fill();
      g.beginPath(); g.arc(px * 0.5, y - px * 0.012, px * 0.075, 0, 3.14, true);
      g.fillStyle = '#2c2b31'; g.fill();
    }
    const t = new window.THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = window.THREE.RepeatWrapping;
    TEX.slot = t;
    return t;
  }

  function plateTexture() {
    if (TEX.plate) return TEX.plate;
    const px = 256, c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    g.fillStyle = '#1b1a1f'; g.fillRect(0, 0, px, px);
    // the ft building plate is perforated on the same 15 mm raster
    const n = 8, step = px / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = i * step + step * 0.5, y = j * step + step * 0.5;
      g.fillStyle = '#0b0a0d';
      g.fillRect(x - step * 0.17, y - step * 0.17, step * 0.34, step * 0.34);
      g.fillStyle = '#2a292f';
      g.fillRect(x - step * 0.17, y - step * 0.19, step * 0.34, step * 0.03);
    }
    const t = new window.THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = window.THREE.RepeatWrapping;
    TEX.plate = t;
    return t;
  }

  const lerp = (a, b, t) => a + (b - a) * Math.min(Math.max(t, 0), 1);
  const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const PARTS = {
    hbw: 'High-Bay Warehouse',
    vgr1: 'Vacuum Gripper Robot 1',
    conveyor: 'Conveyor Belt',
    oven: 'Processing Oven',
    sensor: 'Color Sensor',
    sorter: 'Sorting Station',
    vgr2: 'Sort Gripper Robot',
  };

  class FactoryTwin3D extends HTMLElement {
    static get observedAttributes() { return ['t', 'sim-time', 'playing', 'speed', 'selected', 'accent', 'primary', 'grid']; }

    constructor() {
      super();
      this._simTime = 0; this._playing = true; this._speed = 1;
      this._lastSync = 0; this._raf = 0; this._ready = false;
      this._hover = null;
    }

    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.width = this.style.width || '100%';
      this.style.height = this.style.height || '100%';
      this._label = document.createElement('div');
      Object.assign(this._label.style, {
        position: 'absolute', pointerEvents: 'none', padding: '4px 9px', borderRadius: '7px',
        font: '400 10.5px "JetBrains Mono", monospace', color: '#e2e8f0', whiteSpace: 'nowrap',
        background: 'rgba(10,15,30,.82)', border: '1px solid rgba(255,255,255,.14)',
        transform: 'translate(-50%,-140%)', opacity: '0', transition: 'opacity .15s', zIndex: '5',
      });
      this.appendChild(this._label);
      loadThree().then(() => this._init()).catch((e) => {
        console.error('[twin]', e);
        this.dispatchEvent(new CustomEvent('twin-error', { detail: { message: String(e && e.message || e) }, bubbles: true, composed: true }));
      });
    }

    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      if (this._renderer) this._renderer.dispose();
    }

    attributeChangedCallback(name, _o, v) {
      if (name === 't' || name === 'sim-time') { const t = parseFloat(v); if (!isNaN(t)) { this._simTime = t; this._lastSync = performance.now(); } }
      if (name === 'playing') this._playing = v !== '0' && v !== 'false' && v !== null;
      if (name === 'speed') this._speed = parseFloat(v) || 1;
      if (name === 'selected') this._applySelection(v);
      if (name === 'grid' && this._grid) this._grid.visible = v !== '0' && v !== 'false';
      if ((name === 'accent' || name === 'primary') && this._scene) this._applyTheme();
    }

    _init() {
      const T = window.THREE;
      const r = this._renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      r.setPixelRatio(Math.min(devicePixelRatio, 2));
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFSoftShadowMap;
      r.outputEncoding = T.sRGBEncoding;
      r.toneMapping = T.ACESFilmicToneMapping;
      r.toneMappingExposure = 0.78;
      Object.assign(r.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', cursor: 'grab' });
      this.insertBefore(r.domElement, this._label);

      const scene = this._scene = new T.Scene();
      scene.fog = new T.Fog(0x0a0f1e, 11, 24);

      const cam = this._cam = new T.PerspectiveCamera(38, 16 / 9, 0.1, 100);
      cam.position.set(3.6, 2.45, 4.35);

      const ctl = this._ctl = new T.OrbitControls(cam, r.domElement);
      ctl.target.set(0, 0.42, 0);
      ctl.enableDamping = true; ctl.dampingFactor = 0.07;
      ctl.minDistance = 2.0; ctl.maxDistance = 15;
      ctl.maxPolarAngle = Math.PI / 2.08;
      ctl.enablePan = false;

      scene.add(new T.HemisphereLight(0x93a9cc, 0x101014, 0.12));
      const key = new T.DirectionalLight(0xfff4e6, 1.25);
      key.position.set(3.6, 6.2, 3.4);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.bias = -0.0009;
      const s = key.shadow.camera; s.left = -4.2; s.right = 4.2; s.top = 4.2; s.bottom = -4.2; s.near = 0.5; s.far = 22;
      scene.add(key);
      const rim = new T.DirectionalLight(0x86aae6, 0.12); rim.position.set(-4.4, 2.8, -3.4); scene.add(rim);
      const fill = new T.DirectionalLight(0xffe9d8, 0.12); fill.position.set(-1.5, 2.2, 4.5); scene.add(fill);

      this._build();
      this._applyTheme();

      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this);
      this._resize();

      this._ray = new T.Raycaster();
      this._ptr = new T.Vector2();
      r.domElement.addEventListener('pointermove', (e) => this._onPointer(e));
      r.domElement.addEventListener('pointerleave', () => { this._setHover(null); });
      r.domElement.addEventListener('click', () => {
        if (this._hover) this.dispatchEvent(new CustomEvent('twin-select', {
          detail: { id: this._hover, name: PARTS[this._hover] }, bubbles: true, composed: true,
        }));
      });

      this._clock = performance.now();
      this._loop();
    }

    _mat(color, opts) {
      return new window.THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.05 }, opts || {}));
    }

    _box(w, h, d, mat, x, y, z, id) {
      const m = new window.THREE.Mesh(new window.THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      if (id) m.userData.id = id;
      return m;
    }

    /* A fischertechnik structural beam: 15 x 15 mm cross-section, length in
       whole grid units, carrying the slot-and-hole pattern as a texture.
       axis: 'x' | 'y' | 'z'. */
    _ftBeam(units, axis, x, y, z, id) {
      const T = window.THREE;
      const len = units * FT;
      const w = FT, h = FT;
      const g = axis === 'y' ? new T.BoxGeometry(w, len, h)
              : axis === 'x' ? new T.BoxGeometry(len, h, w)
              :                new T.BoxGeometry(w, h, len);
      const tex = slotTexture().clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, Math.max(1, Math.round(units / 4)));
      const m = new T.Mesh(g, new T.MeshStandardMaterial({
        color: FT_COLORS.black, map: tex, roughness: 0.62, metalness: 0.12,
      }));
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      if (id) m.userData.id = id;
      return m;
    }

    /* Chromed guide rod — the VSG and the Regalbediengerät run on these. */
    _rod(lenUnits, axis, x, y, z, id) {
      const T = window.THREE;
      const g = new T.CylinderGeometry(2 * MM, 2 * MM, lenUnits * FT, 12);
      const m = new T.Mesh(g, this._matAlu);
      if (axis === 'x') m.rotation.z = Math.PI / 2;
      if (axis === 'z') m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      m.castShadow = true;
      if (id) m.userData.id = id;
      return m;
    }

    /* Encoder motor — 24 V, 25:1 gearbox, 75 pulses per output revolution.
       Housing is 4 x 2 x 2 grid units (60 x 30 x 30 mm). */
    _encoderMotor(x, y, z, id, rotY) {
      const T = window.THREE;
      const g = new T.Group();
      g.add(this._box(4 * FT, 2 * FT, 2 * FT, this._matRed, 0, 0, 0, id));
      for (let i = -1; i <= 1; i++) {
        g.add(this._box(4 * FT * 0.98, 1.5 * MM, 1.5 * MM, this._matRedDark, 0, 4 * MM, i * 8 * MM, id));
      }
      const shaft = new T.Mesh(new T.CylinderGeometry(2 * MM, 2 * MM, 8 * MM, 10), this._matAlu);
      shaft.rotation.z = Math.PI / 2; shaft.position.set(2 * FT + 4 * MM, 0, 0);
      g.add(shaft);
      g.position.set(x, y, z);
      if (rotY) g.rotation.y = rotY;
      return g;
    }

    /* S-Motor 24 V with U-gearbox (64.8:1) — drives the conveyor belts. */
    _sMotor(x, y, z, id, rotY) {
      const T = window.THREE;
      const g = new T.Group();
      g.add(this._box(3 * FT, 1.6 * FT, 1.6 * FT, this._matDark, 0, 0, 0, id));
      g.add(this._box(1.4 * FT, 2 * FT, 2 * FT, this._matDark, 2.2 * FT, -2 * MM, 0, id));
      g.position.set(x, y, z);
      if (rotY) g.rotation.y = rotY;
      return g;
    }

    /* Membrane compressor — 24 V, 0.7 bar. The blue box on every board. */
    _compressor(x, y, z, id) {
      const T = window.THREE;
      const g = new T.Group();
      g.add(this._box(4.5 * FT, 2.2 * FT, 2 * FT, this._matBlue, 0, 0, 0, id));
      for (let i = 0; i < 3; i++) {
        g.add(this._box(3.6 * FT, 1.5 * MM, 1.5 * MM, this._mat(0x125e97), 0, 6 * MM, -6 * MM + i * 6 * MM, id));
      }
      g.position.set(x, y, z);
      return g;
    }

    /* Pneumatic cylinder — two of these, mechanically coupled, generate the
       vacuum for the Sauggreifer. */
    _cylinder(lenUnits, x, y, z, id) {
      const T = window.THREE;
      const g = new T.Group();
      const body = new T.Mesh(new T.CylinderGeometry(5 * MM, 5 * MM, lenUnits * FT, 14), this._matGrey);
      body.rotation.z = Math.PI / 2; body.castShadow = true;
      if (id) body.userData.id = id;
      g.add(body);
      for (const sx of [-1, 1]) {
        g.add(this._box(2 * MM, 1.6 * FT, 1.6 * FT, this._matRed, sx * lenUnits * FT * 0.5, 0, 0, id));
      }
      const rod = new T.Mesh(new T.CylinderGeometry(1.6 * MM, 1.6 * MM, 6 * MM, 8), this._matAlu);
      rod.rotation.z = Math.PI / 2; rod.position.x = lenUnits * FT * 0.5 + 3 * MM;
      g.add(rod);
      g.position.set(x, y, z);
      return g;
    }

    /* Vacuum suction cup — the effector of the VSG. */
    _suctionCup(x, y, z, id) {
      const T = window.THREE;
      const g = new T.Group();
      const stem = new T.Mesh(new T.CylinderGeometry(2 * MM, 2 * MM, 8 * MM, 10), this._matGrey);
      stem.position.y = 4 * MM; g.add(stem);
      const cup = new T.Mesh(new T.CylinderGeometry(5.5 * MM, 3 * MM, 5 * MM, 16), this._matWhite);
      cup.position.y = -2 * MM; cup.castShadow = true;
      if (id) cup.userData.id = id;
      g.add(cup);
      g.position.set(x, y, z);
      return g;
    }

    /* Werkstückträger — the white carrier tray that sits in a shelf bay. */
    _carrier(x, y, z, id) {
      const T = window.THREE;
      const g = new T.Group();
      g.add(this._box(4 * FT, 0.5 * FT, 3 * FT, this._matWhite, 0, 0, 0, id));
      g.add(this._box(4 * FT * 0.55, 0.55 * FT, 3 * FT * 0.55, this._mat(0xc9c9c6), 0, 1.5 * MM, 0, id));
      g.position.set(x, y, z);
      return g;
    }

    _build() {
      const T = window.THREE;
      const scene = this._scene;
      const root = this._root = new T.Group();
      scene.add(root);
      this._pickables = [];
      this._accentParts = [];

      // Shared materials — one instance each, reused across every part.
      this._matRed     = this._mat(FT_COLORS.red,      { roughness: 0.6, metalness: 0.02 });
      this._matRedDark = this._mat(FT_COLORS.redDark,  { roughness: 0.5 });
      this._matDark    = this._mat(FT_COLORS.darkGrey, { roughness: 0.58, metalness: 0.2 });
      this._matGrey    = this._mat(FT_COLORS.midGrey,  { roughness: 0.55, metalness: 0.15 });
      this._matAlu     = this._mat(FT_COLORS.alu,      { roughness: 0.28, metalness: 0.85 });
      this._matBlue    = this._mat(FT_COLORS.blue,     { roughness: 0.45 });
      this._matWhite   = this._mat(FT_COLORS.white,    { roughness: 0.6 });
      this._matBlack   = this._mat(FT_COLORS.black,    { roughness: 0.62, metalness: 0.12 });

      // ── Table and perforated building plate ───────────────────────────
      const table = this._box(5.7, 0.10, 3.4, this._mat(FT_COLORS.plate, { roughness: 0.92 }), 0, -0.11, 0);
      root.add(table);

      const ptex = plateTexture().clone();
      ptex.needsUpdate = true;
      ptex.repeat.set(18, 10);
      const plate = new T.Mesh(new T.BoxGeometry(5.4, 0.06, 3.1),
        new T.MeshStandardMaterial({ color: 0x232227, map: ptex, roughness: 0.8, metalness: 0.1 }));
      plate.position.y = -0.03; plate.receiveShadow = true;
      root.add(plate);

      const grid = this._grid = new T.GridHelper(5.4, 72, 0x3a3942, 0x2a2930);
      grid.material.transparent = true; grid.material.opacity = 0.22;
      grid.position.y = 0.032; root.add(grid);

      // ── Hochregallager: 3 x 3 rack on 15 mm raster (x = -2.05) ─────────
      const hbw = this._hbw = new T.Group(); hbw.position.set(-2.05, 0, 0); root.add(hbw);
      const ROW = 0.4, COL = 0.52;                     // shelf pitch
      const rackH = 18;                               // 18 grid units = 270 mm
      for (const sx of [-0.22, 0.22]) for (const sz of [-0.78, -0.26, 0.26, 0.78]) {
        hbw.add(this._ftBeam(rackH, 'y', sx, rackH * FT * 0.5, sz, 'hbw'));
      }
      for (let row = 0; row < 3; row++) {
        const y = 0.14 + row * ROW;
        for (const sx of [-0.22, 0.22]) hbw.add(this._ftBeam(22, 'z', sx, y, 0, 'hbw'));
      }
      this._shelfCells = [];
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const filled = (row * 3 + col) % 4 !== 2;
        const c = this._carrier(0, 0.19 + row * ROW, -COL + col * COL, 'hbw');
        c.visible = filled;
        this._shelfCells.push(c); hbw.add(c);
      }
      // Regalbediengerät: vertical rods + red carriage + telescoping Ausleger
      hbw.add(this._rod(rackH, 'y', 0.4, rackH * FT * 0.5, -0.09, 'hbw'));
      hbw.add(this._rod(rackH, 'y', 0.4, rackH * FT * 0.5, 0.09, 'hbw'));
      this._lift = new T.Group(); this._lift.position.set(0.4, 0.28, 0); hbw.add(this._lift);
      this._lift.add(this._box(2 * FT, 2.5 * FT, 5 * FT, this._matRed, 0, 0, 0, 'hbw'));
      this._lift.add(this._box(5 * FT, 0.6 * FT, 1.2 * FT, this._matBlack, -2.2 * FT, 0, 0, 'hbw'));
      hbw.add(this._encoderMotor(0.4, 0.06, 0.42, 'hbw', Math.PI / 2));

      // ── Vakuum-Sauggreifer VGR-1 (x = -1.28) ──────────────────────────
      const vgr1 = this._vgr1 = new T.Group(); vgr1.position.set(-1.28, 0, 0); root.add(vgr1);
      vgr1.add(this._box(8 * FT, 0.6 * FT, 8 * FT, this._matBlack, 0, 0.02, 0, 'vgr1'));
      const ring1 = new T.Mesh(new T.CylinderGeometry(3.4 * FT, 3.6 * FT, 1.2 * FT, 28), this._matRed);
      ring1.position.y = 0.08; ring1.castShadow = true; ring1.userData.id = 'vgr1';
      vgr1.add(ring1);
      vgr1.add(this._compressor(0.34, 0.11, -0.34, 'vgr1'));

      const col1 = this._col1 = new T.Group(); col1.position.y = 0.14; vgr1.add(col1);
      // vertical axis: two chromed rods in a red carrier, exactly as built
      for (const sz of [-0.05, 0.05]) col1.add(this._rod(46, 'y', 0, 0.345, sz, 'vgr1'));
      col1.add(this._box(4 * FT, 2 * FT, 6 * FT, this._matRed, 0, 0.02, 0, 'vgr1'));
      col1.add(this._box(4 * FT, 2 * FT, 6 * FT, this._matRed, 0, 0.68, 0, 'vgr1'));
      col1.add(this._encoderMotor(0.14, 0.66, 0, 'vgr1'));

      const arm1 = this._arm1 = new T.Group(); arm1.position.y = 0.6; col1.add(arm1);
      // horizontal axis: aluminium extrusion carrying the effector
      const ext = this._box(0.78, 1.4 * FT, 1.6 * FT, this._matAlu, 0.34, 0, 0, 'vgr1');
      arm1.add(ext);
      arm1.add(this._box(3 * FT, 3 * FT, 4 * FT, this._matRed, 0.04, 0, 0, 'vgr1'));

      const grip1 = this._grip1 = new T.Group(); grip1.position.set(0.7, 0, 0); arm1.add(grip1);
      const gripRing = new T.Mesh(new T.TorusGeometry(2.2 * FT, 3 * MM, 8, 20),
        this._mat(0x5ea2ff, { emissive: 0x11315e, metalness: 0.4 }));
      gripRing.rotation.x = Math.PI / 2; gripRing.position.y = -0.02;
      gripRing.userData.id = 'vgr1';
      grip1.add(gripRing);
      this._accentParts.push({ mesh: gripRing, key: 'primary' });
      grip1.add(this._box(2 * FT, 2.4 * FT, 2 * FT, this._matRed, 0, -0.02, 0, 'vgr1'));
      grip1.add(this._suctionCup(0, -0.12, 0, 'vgr1'));

      // ── Förderband (x -0.95 → 1.15) ───────────────────────────────────
      const conv = this._conv = new T.Group(); root.add(conv);
      for (const sz of [-0.21, 0.21]) conv.add(this._ftBeam(28, 'x', 0.1, 0.4, sz, 'conveyor'));
      this._belt = this._box(2.06, 0.02, 0.36, this._mat(0x2a2a2e, { roughness: 0.92 }), 0.1, 0.42, 0, 'conveyor');
      conv.add(this._belt);
      for (const x of [-0.9, 1.1]) {
        const roller = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.38, 16), this._matRed);
        roller.rotation.x = Math.PI / 2; roller.position.set(x, 0.42, 0);
        roller.castShadow = true; roller.userData.id = 'conveyor';
        conv.add(roller);
        conv.add(this._ftBeam(5, 'y', x, 0.2, -0.21, 'conveyor'));
        conv.add(this._ftBeam(5, 'y', x, 0.2, 0.21, 'conveyor'));
      }
      conv.add(this._sMotor(1.24, 0.42, 0, 'conveyor'));
      this._beltDashes = [];
      for (let i = 0; i < 14; i++) {
        const d = this._box(0.05, 0.008, 0.3, this._mat(0x22d3ee, { emissive: 0x0b5566, roughness: 0.4 }),
          -0.9 + i * 0.15, 0.432, 0, 'conveyor');
        this._beltDashes.push(d); conv.add(d);
        this._accentParts.push({ mesh: d, key: 'accent' });
      }

      // ── Brennofen (straddles the belt at x = -0.12) ───────────────────
      const oven = this._oven = new T.Group(); oven.position.set(-0.12, 0, 0); root.add(oven);
      oven.add(this._box(0.52, 0.42, 0.06, this._matRed, 0, 0.66, -0.30, 'oven'));
      oven.add(this._box(0.52, 0.42, 0.06, this._matRed, 0, 0.66, 0.30, 'oven'));
      oven.add(this._box(0.06, 0.42, 0.60, this._matRed, -0.23, 0.66, 0, 'oven'));
      for (const sz of [-0.30, 0.30]) oven.add(this._ftBeam(4, 'x', 0, 0.90, sz, 'oven'));
      oven.add(this._ftBeam(28, 'z', -0.23, 0.90, 0, 'oven'));
      for (const sx of [-0.23, 0.23]) for (const sz of [-0.30, 0.30]) {
        oven.add(this._ftBeam(6, 'y', sx, 0.49, sz, 'oven'));
      }
      // Ofenschieber — the slide that pushes the workpiece into the kiln
      oven.add(this._box(0.10, 0.05, 0.26, this._matRed, -0.30, 0.47, 0, 'oven'));
      oven.add(this._cylinder(6, -0.02, 0.98, -0.16, 'oven'));
      this._ovenGlow = new T.Mesh(new T.BoxGeometry(0.44, 0.34, 0.5),
        new T.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.08 }));
      this._ovenGlow.position.set(0, 0.62, 0); oven.add(this._ovenGlow);
      this._ovenLight = new T.PointLight(0xff7a1a, 0, 1.6);
      this._ovenLight.position.set(-0.12, 0.62, 0); root.add(this._ovenLight);

      // ── Farbsensor / Lichtschranke (x = 0.58) ─────────────────────────
      const sens = this._sens = new T.Group(); sens.position.set(0.58, 0, 0); root.add(sens);
      sens.add(this._ftBeam(8, 'y', 0, 0.30, 0.26, 'sensor'));
      sens.add(this._ftBeam(4, 'x', 0, 0.60, 0.26, 'sensor'));
      sens.add(this._box(2.4 * FT, 1.6 * FT, 2.4 * FT, this._matDark, 0, 0.58, 0.06, 'sensor'));
      // opposing lens lamp of the light barrier
      sens.add(this._ftBeam(6, 'y', 0, 0.22, -0.24, 'sensor'));
      sens.add(this._box(1.4 * FT, 1.2 * FT, 1.2 * FT, this._matWhite, 0, 0.46, -0.24, 'sensor'));
      this._beam = new T.Mesh(new T.CylinderGeometry(0.02, 0.05, 0.30, 16, 1, true),
        new T.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0 }));
      this._beam.position.set(0, 0.50, 0.06); sens.add(this._beam);
      this._accentParts.push({ mesh: this._beam, key: 'accent' });

      // ── Sauggreifer VGR-2 (x = 1.32, z = 0.62) ────────────────────────
      const vgr2 = this._vgr2 = new T.Group(); vgr2.position.set(1.32, 0, 0.62); root.add(vgr2);
      vgr2.add(this._box(6 * FT, 0.5 * FT, 6 * FT, this._matBlack, 0, 0.02, 0, 'vgr2'));
      const ring2 = new T.Mesh(new T.CylinderGeometry(2.4 * FT, 2.6 * FT, FT, 24), this._matRed);
      ring2.position.y = 0.07; ring2.castShadow = true; ring2.userData.id = 'vgr2';
      vgr2.add(ring2);
      const col2 = this._col2 = new T.Group(); col2.position.y = 0.12; vgr2.add(col2);
      for (const sz of [-0.04, 0.04]) col2.add(this._rod(30, 'y', 0, 0.22, sz, 'vgr2'));
      col2.add(this._box(3 * FT, 2 * FT, 4 * FT, this._matRed, 0, 0.44, 0, 'vgr2'));
      col2.add(this._box(0.44, 1.2 * FT, 1.4 * FT, this._matAlu, 0.22, 0.44, 0, 'vgr2'));
      col2.add(this._suctionCup(0.42, 0.38, 0, 'vgr2'));
      vgr2.add(this._sMotor(-0.2, 0.06, 0.2, 'vgr2'));

      // ── Sortierstrecke: three colour bins (x = 1.92) ──────────────────
      const sorter = this._sorter = new T.Group(); sorter.position.set(1.92, 0, 0); root.add(sorter);
      sorter.add(this._box(0.62, 0.06, 1.74, this._matBlack, 0, 0.24, 0, 'sorter'));
      for (const sz of [-0.84, 0.84]) sorter.add(this._ftBeam(3, 'y', -0.28, 0.11, sz, 'sorter'));
      const WORK = [FT_COLORS.white, FT_COLORS.workRed, FT_COLORS.workBlue];
      this._bins = BIN_COLORS.map((c, i) => {
        const z = -0.55 + i * 0.55;
        const bin = this._box(0.46, 0.22, 0.42, this._mat(0x2b2a30, { roughness: 0.75 }), 0, 0.38, z, 'sorter');
        sorter.add(bin);
        // colour tab identifying the bay — white / red / blue, as in the kit
        sorter.add(this._box(0.47, 0.03, 0.43, this._mat(WORK[i], { roughness: 0.5 }), 0, 0.50, z, 'sorter'));
        const edge = new T.LineSegments(new T.EdgesGeometry(bin.geometry),
          new T.LineBasicMaterial({ color: c, transparent: true, opacity: 0.5 }));
        edge.position.copy(bin.position); sorter.add(edge);
        bin.userData.edge = edge;
        return bin;
      });
      sorter.add(this._compressor(-0.02, 0.13, 0, 'sorter'));

      // ── Werkstück (the puck the cycle moves) ──────────────────────────
      this._item = new T.Mesh(new T.CylinderGeometry(11 * MM, 11 * MM, 12 * MM, 24),
        this._mat(FT_COLORS.white, { roughness: 0.5 }));
      this._item.castShadow = true; this._item.visible = false; root.add(this._item);

      // Selection ring
      this._ring = new T.Mesh(new T.RingGeometry(0.3, 0.36, 40),
        new T.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.75, side: T.DoubleSide }));
      this._ring.rotation.x = -Math.PI / 2; this._ring.position.y = 0.014; this._ring.visible = false;
      root.add(this._ring);
      this._accentParts.push({ mesh: this._ring, key: 'accent' });

      root.traverse((o) => { if (o.isMesh && o.userData.id) this._pickables.push(o); });
      this._partAnchors = {
        hbw: [-2.05, 0], vgr1: [-1.28, 0], conveyor: [0.1, 0], oven: [-0.12, 0],
        sensor: [0.58, 0.05], vgr2: [1.32, 0.62], sorter: [1.92, 0],
      };
    }

    _applyTheme() {
      const T = window.THREE;
      const a = this.getAttribute('accent') || '#22d3ee';
      const p = this.getAttribute('primary') || '#5ea2ff';
      try {
        const ca = new T.Color(a), cp = new T.Color(p);
        (this._accentParts || []).forEach(({ mesh, key }) => {
          const c = key === 'primary' ? cp : ca;
          mesh.material.color.copy(c);
          if (mesh.material.emissive) mesh.material.emissive.copy(c).multiplyScalar(0.32);
        });
      } catch (e) { /* invalid color string */ }
    }

    _applySelection(id) {
      this._selected = id || null;
      if (!this._ring) return;
      const a = this._partAnchors[this._selected];
      this._ring.visible = !!a;
      if (a) this._ring.position.set(a[0], 0.012, a[1]);
    }

    _resize() {
      if (!this._renderer) return;
      const w = this.clientWidth || 640, h = this.clientHeight || 360;
      this._renderer.setSize(w, h, false);
      this._cam.aspect = w / Math.max(h, 1); this._cam.updateProjectionMatrix();
    }

    _onPointer(e) {
      const r = this._renderer.domElement.getBoundingClientRect();
      this._ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this._ray.setFromCamera(this._ptr, this._cam);
      const hit = this._ray.intersectObjects(this._pickables, false)[0];
      this._setHover(hit ? hit.object.userData.id : null, e.clientX - r.left, e.clientY - r.top);
    }

    _setHover(id, x, y) {
      this._hover = id;
      this._renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
      if (!id) { this._label.style.opacity = '0'; return; }
      this._label.textContent = PARTS[id] || id;
      this._label.style.left = x + 'px';
      this._label.style.top = y + 'px';
      this._label.style.opacity = '1';
    }

    _loop() {
      this._raf = requestAnimationFrame(() => this._loop());
      const now = performance.now();
      const dt = Math.min((now - this._clock) / 1000, 0.1);
      this._clock = now;
      if (this._playing) this._simTime += dt * this._speed;
      this._update(this._simTime);
      this._ctl.update();
      this._renderer.render(this._scene, this._cam);
      if (!this._ready) {
        this._ready = true;
        this.dispatchEvent(new CustomEvent('twin-ready', { bubbles: true, composed: true }));
      }
    }

    _update(t) {
      const { name, p } = phaseAt(t);
      const cycle = Math.floor(t / TOTAL);
      const binIdx = ((cycle % 3) + 3) % 3;
      const item = this._item;

      // HBW lift
      const liftTarget = name === 'picking' ? 0.59 : 0.19;
      this._lift.position.y += (liftTarget - this._lift.position.y) * 0.06;

      // VGR-1: swings from rack (-90°) to belt (0°)
      let a1 = 0;
      if (name === 'idle') a1 = -Math.PI / 2;
      else if (name === 'picking') a1 = lerp(-Math.PI / 2, 0, ease(p));
      else if (name === 'moving') a1 = 0;
      else a1 = lerp(0, -Math.PI / 2, Math.min(p * 0.6, 1));
      this._col1.rotation.y += (a1 - this._col1.rotation.y) * 0.12;

      // VGR-2
      const a2 = name === 'sorting' || name === 'storing' ? -0.6 : 0.35;
      this._col2.rotation.y += (a2 - this._col2.rotation.y) * 0.07;

      // Belt dashes
      const beltRunning = name === 'moving' || name === 'sorting';
      const off = (t * (beltRunning ? 0.6 : 0)) % 0.15;
      this._beltDashes.forEach((d, i) => {
        d.position.x = -0.9 + ((i * 0.15 + off) % 2.1);
        d.material.opacity = beltRunning ? 1 : 0.25;
        d.material.transparent = true;
      });

      // Oven
      const baking = name === 'baking';
      const heat = baking ? p : name === 'cooling' ? 1 - p : 0;
      this._ovenGlow.material.opacity = 0.06 + heat * 0.4;
      this._ovenLight.intensity = heat * 2.2 * (0.85 + 0.15 * Math.sin(t * 9));

      // Sensor beam
      const detecting = name === 'detecting';
      this._beam.material.opacity = detecting ? 0.18 + 0.12 * Math.sin(t * 12) : 0;

      // Bin highlight
      this._bins.forEach((b, i) => {
        const on = i === binIdx && (name === 'sorting' || name === 'storing');
        b.userData.edge.material.opacity = on ? 1 : 0.35;
      });

      // Item transport
      const beltY = 0.445;
      item.visible = name !== 'idle';
      item.rotation.y = t * 0.6;
      if (name === 'picking') {
        const rackY = 0.19 + 0.4;
        item.position.set(lerp(-1.9, -0.9, ease(p)), lerp(rackY, beltY + 0.1, ease(p)), 0);
      } else if (name === 'moving') {
        item.position.set(lerp(-0.9, -0.12, p), beltY, 0);
      } else if (name === 'baking' || name === 'cooling') {
        item.position.set(-0.12, beltY, 0);
      } else if (name === 'detecting') {
        item.position.set(lerp(-0.12, 0.58, ease(p)), beltY, 0);
      } else if (name === 'sorting') {
        item.position.set(lerp(0.58, 1.92, ease(p)), beltY, lerp(0, -0.55 + binIdx * 0.55, ease(p)));
      } else if (name === 'storing') {
        item.position.set(1.92, lerp(beltY, 0.58, ease(p)), -0.55 + binIdx * 0.55);
      }
      const cooked = name === 'baking' ? p : (name === 'idle' || name === 'picking' || name === 'moving') ? 0 : 1;
      item.material.color.setHex(FT_COLORS.white).lerp(new window.THREE.Color(BIN_COLORS[binIdx]), cooked * 0.85);
    }
  }

  if (!customElements.get('factory-twin-3d')) customElements.define('factory-twin-3d', FactoryTwin3D);
})();
