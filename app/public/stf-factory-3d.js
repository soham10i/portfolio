/* <stf-factory-3d> — the Smart Tabletop Factory, running.

   Geometry and motion both come out of the simulation rather than being drawn
   by hand. `sim/mjcf/export_scene.py` walks the same MJCF MuJoCo compiles and
   writes the visual bodies, geoms, materials and joints; `pack_trajectory.py`
   resamples the solver's own frames to 30 fps and quantises them. So the scene
   you see is the model that passes the 56 verification checks, and in replay
   mode every pose on screen is a pose the solver stepped — nothing here is
   keyframed or eased.

   The run is scrubbable, and it is annotated: each verification run logs, with
   a timestamp, which PLC step of which station it entered, so the page can name
   the step you are watching without inferring anything. Seeking to a step seeks
   the motion with it.

   There is deliberately no mode that "executes the PLC" here. The extracted
   control model carries the step numbers, their comments and their TON waits,
   but not the axis target each step commands — so a live executor would have to
   invent the motion between steps, and inventing it is the one thing this
   project does not do.

   MuJoCo is Z-up, three.js is Y-up; that rotation is applied once at the root
   so every number below still matches the MJCF.

   Events (all bubbling):
     factory-ready  {detail:{scene, meta, joints}}
     factory-error  {detail:{message}}
     factory-tick   {detail:{t, frame, duration, mode, phase}}
     factory-select {detail:{body, station}}                                  */
(function () {
  'use strict';

  const VENDOR = '/vendor/';
  const CDN = 'https://unpkg.com/three@0.147.0/';
  const NEED = [
    ['three.min.js', 'build/three.min.js', () => window.THREE],
    ['OrbitControls.js', 'examples/js/controls/OrbitControls.js',
      () => window.THREE && window.THREE.OrbitControls],
  ];

  let chain = null;
  const script = src => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('failed ' + src));
    document.head.appendChild(s);
  });
  function loadThree() {
    if (NEED.every(([, , has]) => has())) return Promise.resolve();
    if (!chain) chain = NEED.reduce((p, [local, remote, has]) =>
      p.then(() => has() ? null : script(VENDOR + local).catch(() => script(CDN + remote))),
      Promise.resolve());
    return chain;
  }

  /* Binary STL, parsed here rather than pulling in another loader — the two
     fischertechnik profiles are the only meshes in the model. */
  function parseSTL(buf) {
    const dv = new DataView(buf);
    const n = dv.getUint32(80, true);
    const pos = new Float32Array(n * 9), nor = new Float32Array(n * 9);
    let o = 84;
    for (let i = 0; i < n; i++, o += 50) {
      const nx = dv.getFloat32(o, true), ny = dv.getFloat32(o + 4, true), nz = dv.getFloat32(o + 8, true);
      for (let v = 0; v < 3; v++) {
        const b = o + 12 + v * 12, k = i * 9 + v * 3;
        pos[k] = dv.getFloat32(b, true);
        pos[k + 1] = dv.getFloat32(b + 4, true);
        pos[k + 2] = dv.getFloat32(b + 8, true);
        nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
      }
    }
    const T = window.THREE, g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(nor, 3));
    return g;
  }

  /* Which station a body belongs to, from the naming the builders already use. */
  function stationOf(name) {
    if (!name) return null;
    if (name.startsWith('hbw')) return 'hbw';
    if (name.startsWith('mpo')) return 'mpo';
    if (name.startsWith('sld')) return 'sld';
    if (name === 'workpiece' || name === 'transfer_chute') return null;
    return 'vgr';                       // the gripper's bodies carry no prefix
  }
  const STATIONS = ['hbw', 'vgr', 'mpo', 'sld'];

  class StfFactory3D extends HTMLElement {
    constructor() {
      super();
      this._t = 0; this._playing = true; this._speed = 1;
      this._raf = 0; this._last = 0; this._hidden = {}; this._step = -1;
    }

    /* ---- host-facing API ------------------------------------------------ */
    get playing() { return this._playing; }
    set playing(v) { this._playing = !!v; }
    get speed() { return this._speed; }
    set speed(v) { this._speed = Math.max(0.05, +v || 1); }
    get time() { return this._t; }
    set time(v) { this._t = Math.max(0, +v || 0); this._apply(); }
    get duration() { return this._meta ? this._meta.duration : 0; }
    /** Index of the logged PLC step in force at time `t`. */
    stepAt(t) {
      const e = this._events;
      if (!e || !e.length) return -1;
      let i = 0;
      while (i + 1 < e.length && e[i + 1].t <= t) i++;
      return i;
    }
    /** Seek the motion to a logged step. */
    seekStep(i) {
      if (!this._events || !this._events[i]) return;
      this.time = this._events[i].t;
      this._emitTick();
    }
    setStationVisible(id, on) {
      this._hidden[id] = !on;
      if (this._groups) for (const [g, st] of this._groups) if (st === id) g.visible = !!on;
    }
    /** Frame the camera on one station, or on the whole cell with null.
        Deliberately not called `focus` — that is HTMLElement's, and taking it
        over breaks keyboard focus on the element. */
    focusStation(id) {
      if (!this._bounds) return;
      const T = window.THREE;
      const b = (id && this._bounds[id]) || this._bounds.all;
      const c = b.getCenter(new T.Vector3()), r = b.getSize(new T.Vector3()).length() || 1;
      this._ctl.target.copy(c);
      this._cam.position.set(c.x + r * 0.62, c.y + r * 0.55, c.z + r * 0.72);
      this._ctl.update();
    }

    connectedCallback() {
      const cs = getComputedStyle(this);
      if (cs.position === 'static') this.style.position = 'relative';
      if (cs.display === 'inline') this.style.display = 'block';
      loadThree().then(() => this._boot()).catch(e => this._fail(e));
    }
    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      if (this._renderer) { this._renderer.dispose(); this._renderer.domElement.remove(); }
    }
    _fail(e) {
      this.dispatchEvent(new CustomEvent('factory-error', { bubbles: true,
        detail: { message: String((e && e.message) || e) } }));
    }

    /* ---- setup ---------------------------------------------------------- */
    _boot() {
      const T = window.THREE;
      const scene = this._scene = new T.Scene();
      scene.background = new T.Color(0x0d1015);
      const cam = this._cam = new T.PerspectiveCamera(40, 1, 0.01, 60);
      const r = this._renderer = new T.WebGLRenderer({ antialias: true });
      r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
      Object.assign(r.domElement.style, { position: 'absolute', inset: '0',
        width: '100%', height: '100%', display: 'block', cursor: 'grab' });
      this.appendChild(r.domElement);

      const ctl = this._ctl = new T.OrbitControls(cam, r.domElement);
      ctl.enableDamping = true; ctl.dampingFactor = 0.08;
      ctl.minDistance = 0.15; ctl.maxDistance = 6;

      scene.add(new T.HemisphereLight(0xc6d8ff, 0x14181f, 0.75));
      const key = new T.DirectionalLight(0xffffff, 1.15);
      key.position.set(0.7, 1.6, 0.9); key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      const d = 0.9, s = key.shadow.camera;
      s.left = -d; s.right = d; s.top = d; s.bottom = -d; s.near = 0.1; s.far = 6;
      scene.add(key);
      const fill = new T.DirectionalLight(0x9fc0ff, 0.32);
      fill.position.set(-0.9, 0.7, -0.6); scene.add(fill);
      const grid = this._grid = new T.GridHelper(4, 40, 0x252c38, 0x1a2029);
      grid.material.transparent = true; grid.material.opacity = 0.5;
      grid.position.y = -0.001; scene.add(grid);

      const resize = () => {
        const w = this.clientWidth || 1, h = this.clientHeight || 1;
        cam.aspect = w / h; cam.updateProjectionMatrix(); r.setSize(w, h, false);
      };
      this._ro = new ResizeObserver(resize); this._ro.observe(this); resize();

      const base = this.getAttribute('data-dir') || '/sim/';
      const run = this.getAttribute('run') || 'factory';
      const sceneName = run.split('-')[0];
      Promise.all([
        fetch(base + 'scene-' + sceneName + '.json').then(r => r.json()),
        fetch(base + 'traj-' + run + '.json').then(r => r.json()),
        fetch(base + 'traj-' + run + '.bin').then(r => r.arrayBuffer()),
        fetch(base + 'ft_beam.stl').then(r => r.arrayBuffer()),
        fetch(base + 'ft_alu.stl').then(r => r.arrayBuffer()),
        fetch(base + 'events-' + run + '.json').then(r => r.ok ? r.json() : null).catch(() => null),
      ]).then(([sc, meta, bin, beam, alu, report]) => {
        this._stl = { 'ft_beam.stl': parseSTL(beam), 'ft_alu.stl': parseSTL(alu) };
        this._build(sc);
        this._meta = meta;
        this._q = new Uint16Array(bin);
        this._report = report;
        this._events = (report && report.events) || [];
        this._apply();
        this.focusStation(null);
        this.dispatchEvent(new CustomEvent('factory-ready', { bubbles: true,
          detail: { scene: sc, meta, joints: this._jointNames, report } }));
        this._loop();
      }).catch(e => this._fail(e));
    }

    _build(sc) {
      const T = window.THREE;
      const root = this._root = new T.Group();
      root.rotation.x = -Math.PI / 2;          // MuJoCo Z-up -> three Y-up
      this._scene.add(root);

      const mats = {};
      const texLoader = new T.TextureLoader();
      const matFor = (name, rgba) => {
        const key = name || ('rgba' + (rgba || []).join('_'));
        if (mats[key]) return mats[key];
        const m = sc.materials[name] || null;
        // A textured material has no meaningful rgba in MJCF. Builtin checkers
        // carry their own colours, and the baseplate is a real image, so use
        // each rather than inventing a grey.
        let c = (m && m.texrgb) || (m && !m.texture && m.rgba) || rgba || [0.7, 0.7, 0.7, 1];
        const mat = new T.MeshStandardMaterial({
          color: new T.Color(c[0], c[1], c[2]),
          transparent: (c[3] !== undefined && c[3] < 1), opacity: c[3] === undefined ? 1 : c[3],
          metalness: m && m.reflectance ? 0.3 : 0.1,
          roughness: m && m.shininess ? Math.max(0.2, 1 - m.shininess) : 0.7,
        });
        const tex = m && m.texture && sc.textures && sc.textures[m.texture];
        if (tex && tex.file) {
          const url = (this.getAttribute('data-dir') || '/sim/') + tex.file.split('/').pop();
          mat.map = texLoader.load(url, t => {
            t.wrapS = t.wrapT = T.RepeatWrapping; mat.needsUpdate = true;
          });
          mat.color.setRGB(1, 1, 1);
        }
        return (mats[key] = mat);
      };

      const groups = this._groups = new Map();
      const nodes = this._nodes = [];
      const bounds = { all: new T.Box3() };
      for (const st of STATIONS) bounds[st] = new T.Box3();

      sc.bodies.forEach((b, i) => {
        const g = new T.Group();
        g.name = b.name || ('body' + i);
        g.position.fromArray(b.pos);
        g.quaternion.fromArray(b.quat);
        g.userData.rest = { p: g.position.clone(), q: g.quaternion.clone() };
        g.userData.station = stationOf(b.name);
        (b.parent >= 0 ? nodes[b.parent] : root).add(g);
        nodes[i] = g;
        groups.set(g, g.userData.station);

        for (const gm of b.geoms) {
          let geo = null;
          const sz = gm.size;
          if (gm.type === 'box') geo = new T.BoxGeometry(sz[0] * 2, sz[1] * 2, sz[2] * 2);
          else if (gm.type === 'sphere') geo = new T.SphereGeometry(sz[0], 20, 14);
          else if (gm.type === 'cylinder') {
            geo = new T.CylinderGeometry(sz[0], sz[0], sz[1] * 2, 28);
            geo.rotateX(Math.PI / 2);               // MuJoCo cylinders run along +Z
          } else if (gm.type === 'plane') {
            geo = new T.PlaneGeometry((sz[0] || 4) * 2, (sz[1] || 4) * 2);
          } else if (gm.type === 'mesh') {
            const spec = sc.meshes[gm.mesh];
            const src = spec && this._stl[spec.file];
            if (!src) continue;
            geo = src.clone();
            geo.scale(spec.scale[0], spec.scale[1], spec.scale[2]);
          } else continue;

          const mesh = new T.Mesh(geo, matFor(gm.material, gm.rgba));
          mesh.position.fromArray(gm.pos);
          mesh.quaternion.fromArray(gm.quat);
          if (gm.type !== 'plane') { mesh.castShadow = true; mesh.receiveShadow = true; }
          else { mesh.receiveShadow = true; mesh.userData.floor = true; }
          mesh.userData.body = g.name;
          mesh.userData.station = g.userData.station;
          g.add(mesh);
        }
      });

      root.updateMatrixWorld(true);
      const box = new T.Box3();
      root.traverse(o => {
        if (!o.isMesh || o.userData.floor) return;
        box.setFromObject(o);
        bounds.all.union(box);
        const st = o.userData.station;
        if (st && bounds[st]) bounds[st].union(box);
      });
      this._bounds = bounds;

      // joint -> node, and the qpos offset of each joint, in declaration order
      this._joints = [];
      this._jointNames = [];
      this._jointIndex = {};
      let off = 0;
      for (const j of sc.joints) {
        this._joints.push({ ...j, node: nodes[j.body], off });
        this._jointIndex[j.name] = off;
        this._jointNames.push(j.name);
        off += j.type === 'free' ? 7 : 1;
      }
      this._qdim = off;

      // picking
      const ray = new T.Raycaster(), pt = new T.Vector2();
      this._renderer.domElement.addEventListener('pointerdown', e => {
        const r = this._renderer.domElement.getBoundingClientRect();
        pt.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        pt.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        ray.setFromCamera(pt, this._cam);
        const hit = ray.intersectObject(root, true).find(h => !h.object.userData.floor);
        if (hit) this.dispatchEvent(new CustomEvent('factory-select', { bubbles: true,
          detail: { body: hit.object.userData.body, station: hit.object.userData.station } }));
      });
    }

    /* ---- playback -------------------------------------------------------- */
    _sample(out) {
      const m = this._meta, q = this._q;
      const x = Math.min(this._t * m.fps, m.frames - 1);
      const i = Math.floor(x), j = Math.min(i + 1, m.frames - 1), f = x - i;
      for (let c = 0; c < m.width; c++) {
        const a = q[i * m.width + c] / 65535, b = q[j * m.width + c] / 65535;
        out[c] = m.lo[c] + (a + (b - a) * f) * m.span[c];
      }
      return out;
    }

    _apply() {
      if (!this._joints) return;
      const T = window.THREE;
      const n = this._qdim;
      this._buf = this._buf || new Float64Array(64);
      const q = this._buf;
      q.fill(0, 0, n);

      if (this._meta) {
        if (this._t > this._meta.duration) this._t = 0;
        this._sample(q);
      }

      const w = this._meta ? this._meta.width : n;
      for (const j of this._joints) {
        // some runs record fewer channels than the scene has joints (the VGR
        // run stores its three axes and not the workpiece); leave those at rest
        if (j.off >= w) continue;
        const nd = j.node, rest = nd.userData.rest;
        if (j.type === 'free') {
          nd.position.set(q[j.off], q[j.off + 1], q[j.off + 2]);
          nd.quaternion.set(q[j.off + 4], q[j.off + 5], q[j.off + 6], q[j.off + 3]);
        } else if (j.type === 'slide') {
          nd.position.copy(rest.p).addScaledVector(
            new T.Vector3().fromArray(j.axis), q[j.off]);
        } else {
          nd.quaternion.copy(rest.q).multiply(new T.Quaternion()
            .setFromAxisAngle(new T.Vector3().fromArray(j.axis).normalize(), q[j.off]));
        }
      }
    }

    _emitTick() {
      const i = this.stepAt(this._t);
      const changed = i !== this._step;
      this._step = i;
      this.dispatchEvent(new CustomEvent('factory-tick', { bubbles: true,
        detail: { t: this._t, duration: this.duration, stepIndex: i,
                  step: i >= 0 ? this._events[i] : null, stepChanged: changed } }));
    }

    _loop() {
      const frame = now => {
        this._raf = requestAnimationFrame(frame);
        const dt = this._last ? Math.min((now - this._last) / 1000, 0.1) : 0;
        this._last = now;
        if (this._playing) {
          this._t += dt * this._speed;
          if (this.duration && this._t > this.duration) this._t -= this.duration;
          this._apply();
          this._emitTick();
        }
        this._ctl.update();
        this._renderer.render(this._scene, this._cam);
      };
      this._raf = requestAnimationFrame(frame);
    }
  }

  if (!customElements.get('stf-factory-3d')) customElements.define('stf-factory-3d', StfFactory3D);
})();
