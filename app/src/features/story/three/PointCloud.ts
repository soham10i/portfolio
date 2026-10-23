import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, NormalBlending,
  PerspectiveCamera, Points, Scene, ShaderMaterial, WebGLRenderer,
} from 'three';
import { SETS, buildShapes, type ShapeSet } from './shapes';

/* The home page's background: one point cloud that morphs between the shapes
 * in ./shapes as the visitor scrolls through the chapters.
 *
 * Positions are interpolated on the CPU (a few thousand points, one lerp per
 * frame — cheaper than juggling attribute pairs in a shader). The shader adds
 * the LIDAR feel: a sweep beam rotating about the vertical axis brightens the
 * points it passes, like a scanner's return. Plain three.js, no React, so the
 * module can be lazy-loaded and owns its own lifetime. */

export interface CloudOptions {
  canvas: HTMLCanvasElement;
  count: number;
  dpr: number;
  dark: boolean;
  /** Which morph targets to use (shapes.ts). Default: the home chapters. */
  set?: ShapeSet;
  /** Dim the cloud once past the first shape (home: the hero leads, then
      reading). Off where the cloud should stay present throughout. */
  dimAfterFirst?: boolean;
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uSweep;
  attribute float aSeed;
  varying float vGlow;
  varying float vFade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Angle of this point about the vertical axis, against the sweep angle.
    float ang = atan(position.z, position.x);
    float d = abs(mod(ang - uSweep + 3.14159, 6.28318) - 3.14159);
    vGlow = smoothstep(0.55, 0.0, d);
    // A slow twinkle so the cloud is never perfectly still.
    float tw = 0.75 + 0.25 * sin(uTime * 1.3 + aSeed * 40.0);
    vFade = clamp(1.0 - (-mv.z - 4.0) / 12.0, 0.6, 1.0) * tw;
    gl_PointSize = uSize * (1.0 + vGlow * 0.6) * (6.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uGlowColor;
  uniform float uAlpha;
  uniform float uDim;
  varying float vGlow;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.1, r);
    vec3 col = mix(uColor, uGlowColor, vGlow);
    gl_FragColor = vec4(col, soft * uAlpha * uDim * vFade * (0.9 + vGlow * 0.8));
  }
`;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class PointCloud {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(45, 1, 0.1, 50);
  private group = new Group();
  private geometry = new BufferGeometry();
  private material: ShaderMaterial;
  private shapes: Float32Array[];
  private positions: Float32Array;
  private count: number;
  /** Continuous chapter position: 2.4 = 40% of the way from shape 2 to 3. */
  private target = 0;
  private current = 0;
  private pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  private time = 0;

  private poses: { tilt: number; scale: number }[];
  private dimAfterFirst: boolean;
  /** Per-point departure delay (0–1) for the travel stream between shapes. */
  private delay: Float32Array;
  private baseZ = 7.4;
  /** The morph state the positions were last computed for; skip the
      per-point loop entirely while it has not changed. */
  private lastI = -1;
  private lastF = -1;

  constructor({ canvas, count, dpr, dark, set = 'home', dimAfterFirst = true }: CloudOptions) {
    this.count = count;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setClearColor(0x000000, 0);

    this.camera.position.set(0, 0, 7.4);
    this.shapes = buildShapes(count, set);
    this.poses = SETS[set].poses;
    this.dimAfterFirst = dimAfterFirst;
    this.positions = new Float32Array(this.shapes[0]);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) seeds[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    this.delay = seeds.map((v) => Math.abs(v));

    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));

    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 3.6 * dpr },
        uSweep: { value: 0 },
        uColor: { value: new Color() },
        uGlowColor: { value: new Color() },
        uAlpha: { value: 1 },
        uDim: { value: 1 },
      },
    });
    this.setDark(dark);

    this.group.add(new Points(this.geometry, this.material));
    this.scene.add(this.group);
  }

  /** `tone`: 'warm' for the editorial theme's ink-and-terracotta points. */
  setDark(dark: boolean, tone?: 'warm') {
    const u = this.material.uniforms;
    const [base, glow] = dark ? ['#6f9dff', '#8af4ff'] : tone === 'warm' ? ['#6b3a22', '#c2652e'] : ['#2a4fb8', '#0a8fb3'];
    (u.uColor.value as Color).set(base);
    (u.uGlowColor.value as Color).set(glow);
    u.uAlpha.value = dark ? 1 : 0.8;
    this.material.blending = dark ? AdditiveBlending : NormalBlending;
    this.material.needsUpdate = true;
  }

  resize(w: number, h: number) {
    this.lastI = -1;   // force a recompute after layout changes
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the shapes in frame on tall phone screens.
    this.baseZ = w / h < 1 ? 7.4 / Math.max(0.55, w / h) : 7.4;
    this.camera.position.z = this.baseZ;
    this.camera.updateProjectionMatrix();
  }

  /** Which chapter the visitor is in, as a continuous value. */
  setScroll(chapterPosition: number) {
    this.target = Math.max(0, Math.min(this.shapes.length - 1, chapterPosition));
  }

  setPointer(nx: number, ny: number) {
    this.pointer.x = nx;
    this.pointer.y = ny;
  }

  /** Advance by dt seconds and draw. `animate` false draws a still frame. */
  frame(dt: number, animate = true) {
    if (animate) this.time += dt;
    // Ease toward the scroll target so fast scrolling still morphs smoothly.
    this.current += (this.target - this.current) * Math.min(1, dt * (animate ? 4 : 60));

    const i = Math.min(this.shapes.length - 2, Math.floor(this.current));
    // Hold each shape for part of its chapter, then travel to the next.
    const f = smooth(0.25, 1, this.current - i);
    const a = this.shapes[i], b = this.shapes[i + 1];
    const p = this.positions;
    /* Travel, not a cross-fade: the current place lifts away upward while the
       next rises in from below, and every point flies between them on its own
       delay — a stream that links the two, swirling about the vertical axis
       mid-flight. Scrolling back up plays it in reverse. */
    const LIFT = 3.2;
    const dirty = i !== this.lastI || Math.abs(f - this.lastF) > 1e-4;
    this.lastI = i; this.lastF = f;
    for (let n = 0; dirty && n < this.count; n++) {
      const fk = f <= 0 ? 0 : f >= 1 ? 1 : smooth(0, 1, (f - this.delay[n] * 0.45) / 0.55);
      const k = n * 3;
      let x = a[k] + (b[k] - a[k]) * fk;
      const y = a[k + 1] + (b[k + 1] - a[k + 1]) * fk + LIFT * (f - fk);
      let z = a[k + 2] + (b[k + 2] - a[k + 2]) * fk;
      const swirl = Math.sin(Math.PI * fk) * (1.1 + this.delay[n] * 0.8);
      if (swirl > 1e-3) {
        const c = Math.cos(swirl), sn = Math.sin(swirl);
        const rx = x * c - z * sn;
        z = x * sn + z * c;
        x = rx;
      }
      p[k] = x; p[k + 1] = y; p[k + 2] = z;
    }
    if (dirty) (this.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    // A slight pull back mid-journey, so the stream is seen whole.
    this.camera.position.z = this.baseZ + Math.sin(Math.PI * f) * 1.1;

    const pa = this.poses[i], pb = this.poses[i + 1];
    const tilt = pa.tilt + (pb.tilt - pa.tilt) * f;
    const scale = pa.scale + (pb.scale - pa.scale) * f;

    const s = this.pointer;
    s.sx += (s.x - s.sx) * Math.min(1, dt * 3);
    s.sy += (s.y - s.sy) * Math.min(1, dt * 3);
    this.group.rotation.set(tilt + s.sy * 0.18, this.time * 0.06 + s.sx * 0.35, 0);
    this.group.scale.setScalar(scale);

    const u = this.material.uniforms;
    /* Full strength in the hero; dimmer once the visitor is reading. */
    u.uDim.value = this.dimAfterFirst ? 1 - 0.25 * smooth(0.55, 1.15, this.current) : 0.8;
    u.uTime.value = this.time;
    u.uSweep.value = (this.time * 1.1) % (Math.PI * 2) - Math.PI;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
