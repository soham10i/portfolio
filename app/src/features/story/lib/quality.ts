/* How much 3D the device gets (docs/REDESIGN.md §3.4).
 *
 *   0  no WebGL, or a software rasteriser → poster image, no canvas
 *   1  phones / save-data / weak GPUs     → DPR 1, no transmission
 *   2  mid-range                           → DPR ≤ 1.5, cheap transmission
 *   3  desktop-class GPUs                  → full glass + bloom
 *
 * A heuristic rather than detect-gpu: that library fetches its benchmark table
 * from a CDN at runtime, which the site's CSP (connect-src 'self') blocks. The
 * runtime PerformanceMonitor in the 3D layer corrects a wrong guess downwards. */

export type Quality = 0 | 1 | 2 | 3;

interface NavigatorExtras {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 0;

  let renderer = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return 0;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    return 0;
  }

  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return 0;

  const nav = navigator as Navigator & NavigatorExtras;
  if (nav.connection?.saveData) return 1;

  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;
  const touch = window.matchMedia('(pointer: coarse)').matches;

  if (touch || window.innerWidth < 768) return cores >= 6 && memory >= 4 ? 2 : 1;
  if (/apple m\d|apple gpu|rtx|radeon (rx|pro)|geforce gtx 1[6-9]|arc a\d/i.test(renderer)) return 3;
  return cores >= 8 ? 3 : 2;
}
