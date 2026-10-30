/* The glass bubble behind the Nexus mark and the home page's drifting balls. */

const DEG = Math.PI / 180;

/** A bubble's colours as "r,g,b" triplets, so each can take its own alpha. */
export interface BubbleTone {
  core: string;    // centre of the dark core
  deep: string;    // core just inside the rim
  rim: string;     // coloured band at the edge
  edge: string;    // outermost light
  line: string;    // thin bright rim
  tint: string;    // tail colour of the window reflections
  bounce: string;  // light bounced up from below
  swirl: string;   // light turning inside the core
}

/* One tone per site theme. Dark and light share the original blue. */
export const TONES: Record<'blue' | 'liquid' | 'editorial' | 'slate', BubbleTone> = {
  blue: {
    core: '1,4,18', deep: '3,10,40', rim: '20,60,190', edge: '90,160,255',
    line: '170,215,255', tint: '150,200,255', bounce: '70,150,255', swirl: '60,130,255',
  },
  liquid: {
    core: '3,4,30', deep: '8,10,62', rim: '58,52,230', edge: '165,145,255',
    line: '212,202,255', tint: '196,186,255', bounce: '125,108,255', swirl: '120,100,255',
  },
  editorial: {
    core: '22,10,4', deep: '42,18,8', rim: '154,59,28', edge: '236,156,96',
    line: '255,218,184', tint: '255,212,172', bounce: '222,122,62', swirl: '230,128,70',
  },
  slate: {
    core: '34,40,46', deep: '54,62,70', rim: '104,115,123', edge: '217,226,232',
    line: '238,243,246', tint: '217,226,232', bounce: '190,198,203', swirl: '190,200,208',
  },
};

/** The tone for the theme currently painted on <html>. */
export function currentTone(): BubbleTone {
  const s = document.documentElement.dataset.style;
  return s === 'liquid' || s === 'editorial' || s === 'slate' ? TONES[s] : TONES.blue;
}

/** Paint a glass bubble filling a W×W canvas. `phase` drives the motion: the
    window reflections sway, a glint of light circles the rim and a faint
    swirl turns inside the core, so the bubble reads as rotating. `solid`
    gives the dark core of the logo, otherwise the core is clear so the
    bubble reads on any background. */
export function paintBubble(ctx: CanvasRenderingContext2D, W: number, phase: number, solid = true, tone = TONES.blue) {
  const c = W / 2, R = W * 0.44;
  const sway = Math.sin(phase) * 6 * DEG;
  const rgba = (rgb: string, a: number) => `rgba(${rgb},${a})`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, W);

  // core: dark (or clear) centre deepening to a coloured rim
  const body = ctx.createRadialGradient(c - R * 0.1, c - R * 0.12, R * 0.1, c, c, R);
  body.addColorStop(0, solid ? rgba(tone.core, 0.96) : rgba(tone.rim, 0.03));
  body.addColorStop(0.72, solid ? rgba(tone.deep, 0.94) : rgba(tone.rim, 0.06));
  body.addColorStop(0.92, solid ? rgba(tone.rim, 0.95) : rgba(tone.edge, 0.32));
  body.addColorStop(1, rgba(tone.edge, 0.95));
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  // swirl: two soft lobes of light turning slowly inside the core
  if (solid && 'createConicGradient' in ctx) {
    const sw = ctx.createConicGradient(-phase * 0.6, c, c);
    sw.addColorStop(0, rgba(tone.swirl, 0.42));
    sw.addColorStop(0.18, rgba(tone.swirl, 0));
    sw.addColorStop(0.5, rgba(tone.swirl, 0.26));
    sw.addColorStop(0.68, rgba(tone.swirl, 0));
    sw.addColorStop(1, rgba(tone.swirl, 0.42));
    const fade = ctx.createRadialGradient(c, c, 0, c, c, R * 0.86);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, R * 0.86, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = sw;
    ctx.fillRect(0, 0, W, W);
    // darken the centre again so the swirl lives near the rim, like depth
    fade.addColorStop(0, rgba(tone.core, 0.75));
    fade.addColorStop(0.6, rgba(tone.core, 0.25));
    fade.addColorStop(1, rgba(tone.core, 0));
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, W);
    ctx.restore();
  }

  ctx.lineCap = 'round';
  const arc = (r: number, a0: number, a1: number, w: number, col: string | CanvasGradient, turn = sway) => {
    ctx.beginPath();
    ctx.arc(c, c, R * r, a0 * DEG + turn, a1 * DEG + turn);
    ctx.lineWidth = R * w;
    ctx.strokeStyle = col;
    ctx.stroke();
  };
  const sheen = (a: number, b: number) => {
    const g = ctx.createLinearGradient(c - R, c - R, c + R * 0.2, c + R * 0.2);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, rgba(tone.tint, b));
    return g;
  };

  // thin bright rim
  ctx.beginPath();
  ctx.arc(c, c, R - Math.max(1, W / 160), 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, W / 110);
  ctx.strokeStyle = rgba(tone.line, 0.75);
  ctx.stroke();

  // glint: a comet of light circling the rim, its tail fading behind it
  const spin = phase * 0.9;
  for (let k = 0; k < 7; k++) {
    arc(0.955, -k * 8, -k * 8 + 9, 0.075 - k * 0.008, `rgba(255,255,255,${(0.95 * (1 - k / 7)).toFixed(2)})`, spin);
  }

  // the two curved window reflections, upper left
  arc(0.9, 165, 245, 0.11, sheen(0.9, 0.55));
  arc(0.66, 200, 262, 0.17, sheen(0.95, 0.7));
  // small specular, upper right
  arc(0.88, 312, 330, 0.07, 'rgba(255,255,255,0.95)');
  // bounce light, lower right and lower left
  arc(0.84, 22, 62, 0.06, rgba(tone.bounce, 0.8));
  arc(0.8, 112, 122, 0.04, rgba(tone.edge, 0.6));
}
