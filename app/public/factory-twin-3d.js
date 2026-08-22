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
      Object.assign(r.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', cursor: 'grab' });
      this.insertBefore(r.domElement, this._label);

      const scene = this._scene = new T.Scene();
      scene.fog = new T.Fog(0x0a0f1e, 9, 20);

      const cam = this._cam = new T.PerspectiveCamera(38, 16 / 9, 0.1, 100);
      cam.position.set(3.4, 2.6, 4.2);

      const ctl = this._ctl = new T.OrbitControls(cam, r.domElement);
      ctl.target.set(0, 0.45, 0);
      ctl.enableDamping = true; ctl.dampingFactor = 0.07;
      ctl.minDistance = 2.4; ctl.maxDistance = 11;
      ctl.maxPolarAngle = Math.PI / 2.08;
      ctl.enablePan = false;

      scene.add(new T.HemisphereLight(0x8fb2ee, 0x070c18, 0.38));
      const key = new T.DirectionalLight(0xffffff, 0.9);
      key.position.set(3.2, 5, 3);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      const s = key.shadow.camera; s.left = -5; s.right = 5; s.top = 5; s.bottom = -5; s.near = 0.5; s.far = 20;
      scene.add(key);
      const rim = new T.DirectionalLight(0x5ea2ff, 0.6); rim.position.set(-4, 2.4, -3); scene.add(rim);

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
      return new window.THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.62, metalness: 0.18 }, opts || {}));
    }

    _box(w, h, d, mat, x, y, z, id) {
      const m = new window.THREE.Mesh(new window.THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      if (id) m.userData.id = id;
      return m;
    }

    _build() {
      const T = window.THREE;
      const scene = this._scene;
      const root = this._root = new T.Group();
      scene.add(root);
      this._pickables = [];

      const shellMat = this._mat(0x101728, { roughness: 0.72 });
      const frameMat = this._mat(0x1b2740, { metalness: 0.45, roughness: 0.42 });
      const steel = this._mat(0x5f7391, { metalness: 0.8, roughness: 0.3 });

      // Base plate + grid
      const plate = this._box(5.4, 0.09, 3.1, this._mat(0x0d1424, { roughness: 0.85 }), 0, -0.045, 0);
      root.add(plate);
      const grid = this._grid = new T.GridHelper(5.4, 27, 0x2a3a55, 0x18233a);
      grid.position.y = 0.002; root.add(grid);

      // ── HBW rack (x = -2.05)
      const hbw = this._hbw = new T.Group(); hbw.position.set(-2.05, 0, 0); root.add(hbw);
      hbw.add(this._box(0.5, 1.34, 1.5, shellMat, 0, 0.67, 0, 'hbw'));
      this._shelfCells = [];
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const filled = (row * 3 + col) % 4 !== 2;
        const c = this._box(0.34, 0.3, 0.4, this._mat(filled ? 0x1e3a5f : 0x0f1929, { roughness: 0.75 }),
          0.1, 0.28 + row * 0.4, -0.5 + col * 0.5, 'hbw');
        this._shelfCells.push(c); hbw.add(c);
      }
      this._lift = this._box(0.14, 0.28, 0.42, steel, 0.28, 0.28, 0, 'hbw');
      hbw.add(this._lift);

      // ── VGR-1 (x = -1.3)
      const vgr1 = this._vgr1 = new T.Group(); vgr1.position.set(-1.28, 0, 0); root.add(vgr1);
      const b1 = new T.Mesh(new T.CylinderGeometry(0.22, 0.26, 0.12, 28), frameMat);
      b1.position.y = 0.06; b1.castShadow = true; b1.userData.id = 'vgr1'; vgr1.add(b1);
      const col1 = this._col1 = new T.Group(); col1.position.y = 0.12; vgr1.add(col1);
      const post = new T.Mesh(new T.CylinderGeometry(0.09, 0.1, 0.72, 20), steel);
      post.position.y = 0.36; post.castShadow = true; post.userData.id = 'vgr1'; col1.add(post);
      const arm1 = this._arm1 = new T.Group(); arm1.position.y = 0.72; col1.add(arm1);
      arm1.add(this._box(0.78, 0.09, 0.13, steel, 0.36, 0, 0, 'vgr1'));
      const grip1 = this._grip1 = new T.Group(); grip1.position.set(0.72, 0, 0); arm1.add(grip1);
      grip1.add(this._box(0.12, 0.2, 0.12, this._mat(0x5ea2ff, { emissive: 0x1b3f77, metalness: 0.5 }), 0, -0.12, 0, 'vgr1'));

      // ── Conveyor (x -0.95 → 1.15, z 0)
      const conv = this._conv = new T.Group(); root.add(conv);
      conv.add(this._box(2.1, 0.1, 0.42, frameMat, 0.1, 0.36, 0, 'conveyor'));
      this._belt = this._box(2.06, 0.03, 0.36, this._mat(0x0f1929, { roughness: 0.9 }), 0.1, 0.42, 0, 'conveyor');
      conv.add(this._belt);
      for (const x of [-0.9, 1.1]) {
        const leg = this._box(0.08, 0.32, 0.34, frameMat, x, 0.16, 0, 'conveyor');
        conv.add(leg);
      }
      this._beltDashes = [];
      for (let i = 0; i < 14; i++) {
        const d = this._box(0.07, 0.012, 0.3, this._mat(0x22d3ee, { emissive: 0x0b5566, roughness: 0.4 }), -0.9 + i * 0.15, 0.442, 0, 'conveyor');
        this._beltDashes.push(d); conv.add(d);
      }

      // ── Oven (straddles belt at x = -0.12)
      const oven = this._oven = new T.Group(); oven.position.set(-0.12, 0, 0); root.add(oven);
      oven.add(this._box(0.5, 0.1, 0.62, shellMat, 0, 0.9, 0, 'oven'));
      oven.add(this._box(0.5, 0.4, 0.09, shellMat, 0, 0.68, -0.3, 'oven'));
      oven.add(this._box(0.5, 0.4, 0.09, shellMat, 0, 0.68, 0.3, 'oven'));
      oven.add(this._box(0.09, 0.4, 0.62, shellMat, -0.22, 0.68, 0, 'oven'));
      this._ovenGlow = new T.Mesh(new T.BoxGeometry(0.44, 0.34, 0.5),
        new T.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.08 }));
      this._ovenGlow.position.set(0, 0.66, 0); oven.add(this._ovenGlow);
      this._ovenLight = new T.PointLight(0xff7a1a, 0, 1.6); this._ovenLight.position.set(-0.12, 0.66, 0); root.add(this._ovenLight);

      // ── Color sensor (x = 0.58)
      const sens = this._sens = new T.Group(); sens.position.set(0.58, 0, 0); root.add(sens);
      sens.add(this._box(0.06, 0.5, 0.06, frameMat, 0, 0.72, 0.26, 'sensor'));
      sens.add(this._box(0.16, 0.12, 0.16, this._mat(0x0f1929, { emissive: 0x073844 }), 0, 0.9, 0.05, 'sensor'));
      this._beam = new T.Mesh(new T.CylinderGeometry(0.035, 0.06, 0.42, 16, 1, true),
        new T.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0 }));
      this._beam.position.set(0, 0.66, 0.05); sens.add(this._beam);

      // ── VGR-2 (x = 1.32, z = 0.62)
      const vgr2 = this._vgr2 = new T.Group(); vgr2.position.set(1.32, 0, 0.62); root.add(vgr2);
      const b2 = new T.Mesh(new T.CylinderGeometry(0.16, 0.19, 0.1, 24), frameMat);
      b2.position.y = 0.05; b2.castShadow = true; b2.userData.id = 'vgr2'; vgr2.add(b2);
      const col2 = this._col2 = new T.Group(); col2.position.y = 0.1; vgr2.add(col2);
      const post2 = new T.Mesh(new T.CylinderGeometry(0.07, 0.08, 0.5, 18), steel);
      post2.position.y = 0.25; post2.castShadow = true; post2.userData.id = 'vgr2'; col2.add(post2);
      col2.add(this._box(0.5, 0.07, 0.1, steel, 0.24, 0.5, 0, 'vgr2'));

      // ── Sorter bins (x = 1.9)
      const sorter = this._sorter = new T.Group(); sorter.position.set(1.92, 0, 0); root.add(sorter);
      sorter.add(this._box(0.62, 0.1, 1.7, frameMat, 0, 0.3, 0, 'sorter'));
      this._bins = BIN_COLORS.map((c, i) => {
        const bin = this._box(0.5, 0.26, 0.44, this._mat(0x111a2c, { roughness: 0.7 }), 0, 0.48, -0.55 + i * 0.55, 'sorter');
        sorter.add(bin);
        const edge = new T.LineSegments(new T.EdgesGeometry(bin.geometry), new T.LineBasicMaterial({ color: c, transparent: true, opacity: 0.5 }));
        edge.position.copy(bin.position); sorter.add(edge);
        bin.userData.edge = edge;
        return bin;
      });

      // ── Item (cookie puck)
      this._item = new T.Mesh(new T.CylinderGeometry(0.085, 0.085, 0.05, 24), this._mat(0xd97706, { roughness: 0.5 }));
      this._item.castShadow = true; this._item.visible = false; root.add(this._item);

      // Selection ring
      this._ring = new T.Mesh(new T.RingGeometry(0.3, 0.36, 40),
        new T.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.75, side: T.DoubleSide }));
      this._ring.rotation.x = -Math.PI / 2; this._ring.position.y = 0.012; this._ring.visible = false; root.add(this._ring);

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
        this._beltDashes.forEach((d) => { d.material.color.copy(ca); d.material.emissive.copy(ca).multiplyScalar(0.35); });
        this._beam.material.color.copy(ca);
        this._ring.material.color.copy(ca);
        this._grip1.children[0].material.color.copy(cp);
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
      const liftTarget = name === 'picking' ? 0.68 : 0.28;
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
      const beltY = 0.49;
      item.visible = name !== 'idle';
      item.rotation.y = t * 0.6;
      if (name === 'picking') {
        const rackY = 0.28 + 0.4;
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
      item.material.color.setHex(0xd9a706).lerp(new window.THREE.Color(BIN_COLORS[binIdx]), cooked * 0.75);
    }
  }

  if (!customElements.get('factory-twin-3d')) customElements.define('factory-twin-3d', FactoryTwin3D);
})();
