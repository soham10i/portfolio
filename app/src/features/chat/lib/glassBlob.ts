/* Nexus's mark as an iridescent liquid-glass blob: a softly wobbling outline,
 * folded surface waves, and thin-film colour that shifts towards the rim,
 * lit from the upper left.
 *
 * One WebGL context is shared by every orb on the page (browsers cap the
 * number of live contexts): each orb's frame is rendered into the shared
 * canvas, then copied onto that orb's own 2D canvas. If WebGL is missing or
 * the context is lost, renderBlob returns false and the caller falls back to
 * the 2D bubble in bubble.ts. */

type Rgb = [number, number, number];

/** Base glass colour plus the three thin-film hues it cycles through. */
export interface BlobPalette { base: Rgb; a: Rgb; b: Rgb; c: Rgb }

/* One palette per site theme; dark and light share the pastel blue/pink/lilac. */
export const BLOB_PALETTES: Record<'blue' | 'liquid' | 'editorial' | 'slate', BlobPalette> = {
  blue: { base: [0.8, 0.88, 1], a: [0.52, 0.74, 1], b: [1, 0.7, 0.88], c: [0.76, 0.66, 1] },
  liquid: { base: [0.78, 0.76, 1], a: [0.45, 0.46, 1], b: [0.72, 0.56, 1], c: [0.55, 0.9, 1] },
  editorial: { base: [1, 0.88, 0.78], a: [0.95, 0.6, 0.44], b: [1, 0.83, 0.56], c: [0.96, 0.7, 0.76] },
  slate: { base: [0.87, 0.9, 0.93], a: [0.7, 0.79, 0.88], b: [0.9, 0.82, 0.9], c: [0.78, 0.9, 0.88] },
};

/** The palette for the theme currently painted on <html>. */
export function currentPalette(): BlobPalette {
  const s = document.documentElement.dataset.style;
  return s === 'liquid' || s === 'editorial' || s === 'slate' ? BLOB_PALETTES[s] : BLOB_PALETTES.blue;
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform float uRes, uTime, uEnergy;
uniform vec3 uBase, uA, uB, uC;
varying vec2 vUv;

// Thin-film stand-in: cycle smoothly through the three hues.
vec3 film(float x) {
  x = fract(x);
  vec3 c = mix(uA, uB, smoothstep(0.0, 0.34, x));
  c = mix(c, uC, smoothstep(0.34, 0.67, x));
  return mix(c, uA, smoothstep(0.67, 1.0, x));
}

// Folded waves: two rounds of domain warping over crossed sines.
float folds(vec2 p, float t) {
  vec2 q = p + 0.35 * vec2(sin(2.3 * p.y + 1.1 * t), cos(2.1 * p.x - 0.9 * t));
  q += 0.18 * vec2(sin(4.1 * q.y - 1.4 * t), cos(3.7 * q.x + 1.2 * t));
  return 0.5 * sin(3.2 * q.x + 2.4 * q.y + 0.6 * t) + 0.5 * sin(2.7 * q.y - 1.9 * q.x - 0.4 * t);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float t = uTime;
  float ang = atan(p.y, p.x);

  // Wobbling outline; breathes a little more while Nexus is busy.
  float R = 0.8 * (1.0 + 0.045 * sin(3.0 * ang + 0.8 * t) + 0.03 * sin(5.0 * ang - 1.1 * t + 1.3)
                 + 0.02 * sin(2.0 * ang + 0.5 * t)) * (1.0 + 0.025 * uEnergy * sin(5.0 * t));
  float d = length(p);
  float px = 2.0 / uRes;
  float mask = 1.0 - smoothstep(R - 1.5 * px, R + 0.5 * px, d);
  if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }

  // Sphere normal, bent by the folds.
  vec2 s = p / R;
  float z = sqrt(max(0.0, 1.0 - dot(s, s)));
  float h = folds(s, t);
  float e = 0.02;
  vec2 g = vec2(folds(s + vec2(e, 0.0), t) - h, folds(s + vec2(0.0, e), t) - h) / e;
  vec3 n = normalize(vec3(s, z) + vec3(-g * 0.42 * (0.4 + z), 0.0));

  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.6);
  vec3 L = normalize(vec3(-0.5, 0.6, 0.8));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 60.0);
  float spec2 = 0.35 * pow(clamp(dot(n, normalize(vec3(0.6, -0.5, 1.7))), 0.0, 1.0), 30.0);

  vec3 iri = film(0.55 * h + 0.9 * fres + dot(n.xy, vec2(0.45, -0.3)) + 0.05 * t);
  vec3 col = mix(uBase, iri, 0.5 + 0.45 * fres);
  col *= 0.7 + 0.4 * diff;
  col += vec3(spec + spec2);
  col += 0.25 * smoothstep(0.85, 1.0, d / R) * iri;   // rim light

  float alpha = mask * (0.84 + 0.16 * fres);
  gl_FragColor = vec4(min(col, 1.0) * alpha, alpha);   // premultiplied
}`;

interface Renderer {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  u: Record<'res' | 'time' | 'energy' | 'base' | 'a' | 'b' | 'c', WebGLUniformLocation | null>;
}

let renderer: Renderer | null | undefined;   // undefined: not tried yet; null: unavailable

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
}

function init(): Renderer | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.clearColor(0, 0, 0, 0);

  canvas.addEventListener('webglcontextlost', () => { renderer = null; });
  const u = (name: string) => gl.getUniformLocation(prog, name);
  return {
    canvas, gl,
    u: { res: u('uRes'), time: u('uTime'), energy: u('uEnergy'), base: u('uBase'), a: u('uA'), b: u('uB'), c: u('uC') },
  };
}

/** Paint the blob onto a W×W 2D canvas. `time` drives the motion, `energy`
    (0..1) how busy it looks. Returns false when WebGL is unavailable. */
export function renderBlob(ctx: CanvasRenderingContext2D, W: number, time: number, energy: number, pal: BlobPalette) {
  if (renderer === undefined) renderer = init();
  if (!renderer) return false;
  const { canvas, gl, u } = renderer;
  // The shared canvas only grows; smaller orbs render into its bottom-left corner.
  if (canvas.width < W || canvas.height < W) { canvas.width = canvas.height = Math.max(W, canvas.width, canvas.height); }
  gl.viewport(0, 0, W, W);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(u.res, W);
  gl.uniform1f(u.time, time);
  gl.uniform1f(u.energy, energy);
  gl.uniform3fv(u.base, pal.base);
  gl.uniform3fv(u.a, pal.a);
  gl.uniform3fv(u.b, pal.b);
  gl.uniform3fv(u.c, pal.c);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, W);
  ctx.drawImage(canvas, 0, canvas.height - W, W, W, 0, 0, W, W);
  return true;
}
