import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Group, Line, LineBasicMaterial,
  Mesh, MeshBasicMaterial, PerspectiveCamera, Points, RingGeometry, Scene, ShaderMaterial, SphereGeometry,
  WebGLRenderer, GridHelper, DoubleSide,
} from 'three';

/* Replay of a real teleop_mapping run (maze1, Webots ROSbot).
 *
 * Data: /media/work/<name>-points.bin + <name>-run.json, built from the run's
 * scene.ply and map.npz by scripts/build-lidar-asset.py. Points arrive sorted
 * by the pose from which the robot could first see them, so uncovering the map
 * is a draw range over one buffer. The robot marker drives the recorded
 * trajectory; freshly seen points flare; the two pillars light up when found.
 *
 * Source frame is ROS-style (x, y on the floor, z up); three.js is y-up, so a
 * point (x, y, z) is drawn at (x, z, -y). */

interface RunMeta {
  count: number;
  bounds: { min: number[]; max: number[] };
  sensorRange: number;
  poses: [number, number, number][];
  pillars: { blue: number[]; yellow: number[] };
}

const VERT = /* glsl */ `
  attribute float aReveal;
  attribute float aHeight;
  uniform float uProgress;
  uniform float uSize;
  varying float vFresh;
  varying float vHeight;
  void main() {
    vHeight = aHeight;
    vFresh = 1.0 - smoothstep(0.0, 0.035, uProgress - aReveal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * (1.0 + vFresh * 1.6) * (9.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying float vFresh;
  varying float vHeight;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    // floor → deep blue; wall base → cyan; wall top / pillars → violet-white
    vec3 floorC = vec3(0.12, 0.25, 0.78);
    vec3 lowC = vec3(0.13, 0.83, 0.93);
    vec3 highC = vec3(0.78, 0.66, 1.0);
    vec3 col = vHeight < 0.04 ? floorC : mix(lowC, highC, smoothstep(0.04, 0.7, vHeight));
    col = mix(col, vec3(1.0), vFresh * 0.75);
    float a = smoothstep(0.5, 0.15, r) * (0.75 + vFresh * 0.25);
    gl_FragColor = vec4(col, a);
  }
`;

export class LidarReplay {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(38, 1, 0.05, 100);
  private root = new Group();
  private cloud!: Points;
  private material!: ShaderMaterial;
  private reveal!: Float32Array;
  private meta!: RunMeta;
  private trail!: Line;
  private trailPos!: Float32Array;
  private robot = new Group();
  private ring!: Mesh;
  private pillars: { mesh: Mesh; at: number[]; found: boolean }[] = [];
  private center = [0, 0];
  private extent = 8;
  private t = 0;               // seconds into the current loop
  private orbit = 0;
  private pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  ready = false;

  static RUN_SECONDS = 24;
  static HOLD_SECONDS = 5;

  constructor(canvas: HTMLCanvasElement, dpr: number) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(this.root);
  }

  async load(base: string) {
    const [meta, buf] = await Promise.all([
      fetch(`${base}-run.json`).then((r) => r.json() as Promise<RunMeta>),
      fetch(`${base}-points.bin`).then((r) => r.arrayBuffer()),
    ]);
    this.meta = meta;
    const n = meta.count;
    const mm = new Int16Array(buf, 0, n * 3);
    const rv = new Uint16Array(buf, n * 3 * 2, n);
    const last = Math.max(1, meta.poses.length - 1);

    const { min, max } = meta.bounds;
    this.center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
    this.extent = Math.max(max[0] - min[0], max[1] - min[1]);
    const [cx, cy] = this.center;

    const pos = new Float32Array(n * 3);
    const height = new Float32Array(n);
    this.reveal = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = mm[i * 3] / 1000, y = mm[i * 3 + 1] / 1000, z = mm[i * 3 + 2] / 1000;
      pos[i * 3] = x - cx; pos[i * 3 + 1] = z; pos[i * 3 + 2] = -(y - cy);
      height[i] = z;
      this.reveal[i] = rv[i] / last;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aReveal', new BufferAttribute(this.reveal, 1));
    g.setAttribute('aHeight', new BufferAttribute(height, 1));
    g.setDrawRange(0, 0);
    this.material = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uProgress: { value: 0 }, uSize: { value: 2.2 * this.renderer.getPixelRatio() } },
    });
    this.cloud = new Points(g, this.material);
    this.cloud.frustumCulled = false;
    this.root.add(this.cloud);

    const grid = new GridHelper(Math.ceil(this.extent) + 2, (Math.ceil(this.extent) + 2) * 2, 0x24324a, 0x141c2b);
    grid.position.y = -0.055;
    this.root.add(grid);

    // trajectory
    this.trailPos = new Float32Array(meta.poses.length * 3);
    meta.poses.forEach(([x, y], i) => { this.trailPos.set([x - cx, 0.01, -(y - cy)], i * 3); });
    const tg = new BufferGeometry();
    tg.setAttribute('position', new BufferAttribute(this.trailPos, 3));
    tg.setDrawRange(0, 0);
    this.trail = new Line(tg, new LineBasicMaterial({ color: 0x86ff9f, transparent: true, opacity: 0.85 }));
    this.trail.frustumCulled = false;
    this.root.add(this.trail);

    // robot: glowing body, heading nub, sensor-range ring
    const body = new Mesh(new SphereGeometry(0.09, 20, 16), new MeshBasicMaterial({ color: 0xffffff }));
    body.position.y = 0.1;
    const nub = new Mesh(new SphereGeometry(0.04, 12, 10), new MeshBasicMaterial({ color: 0x86ff9f }));
    nub.position.set(0.13, 0.1, 0);
    this.ring = new Mesh(
      new RingGeometry(meta.sensorRange - 0.03, meta.sensorRange, 96),
      new MeshBasicMaterial({ color: 0x3fd4e8, transparent: true, opacity: 0.25, side: DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.0;
    this.robot.add(body, nub, this.ring);
    this.root.add(this.robot);

    // pillars
    for (const [key, col] of [['blue', 0x4f86ff], ['yellow', 0xffd23f]] as const) {
      const at = meta.pillars[key];
      const mesh = new Mesh(
        new CylinderGeometry(0.11, 0.11, 0.75, 24, 1, true),
        new MeshBasicMaterial({ color: new Color(col), transparent: true, opacity: 0.12, blending: AdditiveBlending, side: DoubleSide, depthWrite: false }),
      );
      mesh.position.set(at[0] - cx, 0.37, -(at[1] - cy));
      this.root.add(mesh);
      this.pillars.push({ mesh, at, found: false });
    }

    this.ready = true;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setPointer(nx: number, ny: number) { this.pointer.x = nx; this.pointer.y = ny; }

  /** Count of points revealed by `progress` (binary search; points are sorted). */
  private revealedCount(progress: number) {
    let lo = 0, hi = this.reveal.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.reveal[m] <= progress) lo = m + 1; else hi = m; }
    return lo;
  }

  /** Advance dt seconds. `animate` false shows the finished map, still. */
  frame(dt: number, animate = true) {
    if (!this.ready) return;
    const { RUN_SECONDS, HOLD_SECONDS } = LidarReplay;
    if (animate) {
      this.t += dt;
      if (this.t > RUN_SECONDS + HOLD_SECONDS) this.t = 0;
      this.orbit += dt * 0.12;
    }
    const progress = animate ? Math.min(1, this.t / RUN_SECONDS) : 1;
    const poses = this.meta.poses;
    const fi = progress * (poses.length - 1);
    const i = Math.floor(fi), f = fi - i;
    const a = poses[i], b = poses[Math.min(i + 1, poses.length - 1)];
    const [cx, cy] = this.center;
    const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
    this.robot.position.set(x - cx, 0, -(y - cy));
    this.robot.rotation.y = a[2];
    this.robot.visible = progress < 1;
    (this.ring.material as MeshBasicMaterial).opacity = 0.18 + 0.12 * Math.sin(this.t * 4);

    this.cloud.geometry.setDrawRange(0, this.revealedCount(progress));
    this.material.uniforms.uProgress.value = progress;
    this.trail.geometry.setDrawRange(0, i + 1);

    const R2 = this.meta.sensorRange ** 2;
    for (const p of this.pillars) {
      const seen = progress >= 1 || poses.slice(0, i + 1).some(([px, py]) => (px - p.at[0]) ** 2 + (py - p.at[1]) ** 2 <= R2);
      if (seen !== p.found) p.found = seen;
      const m = p.mesh.material as MeshBasicMaterial;
      m.opacity += ((seen ? 0.85 : 0.08) - m.opacity) * Math.min(1, dt * 4 + (animate ? 0 : 1));
    }

    // camera: slow orbit, elevated, pointer parallax
    const s = this.pointer;
    s.sx += (s.x - s.sx) * Math.min(1, dt * 3);
    s.sy += (s.y - s.sy) * Math.min(1, dt * 3);
    const r = this.extent * 0.92;
    const ang = this.orbit + s.sx * 0.4;
    const elev = 0.95 - s.sy * 0.15;
    this.camera.position.set(Math.cos(ang) * r * Math.cos(elev), r * Math.sin(elev), Math.sin(ang) * r * Math.cos(elev));
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /** 0..1 progress and pose index — for the HUD. */
  status() {
    const p = Math.min(1, this.t / LidarReplay.RUN_SECONDS);
    return { progress: p, pose: Math.round(p * ((this.meta?.poses.length ?? 1) - 1)), poses: this.meta?.poses.length ?? 0, points: this.revealedCount(p) };
  }

  dispose() {
    this.cloud?.geometry.dispose();
    this.material?.dispose();
    this.renderer.dispose();
  }
}
