/* Compositing keyframes into ONE image for the VLM.
 *
 * ── Why a contact sheet and not N images ─────────────────────────────────────
 * Measured against meta/llama-3.2-11b-vision-instruct on NVIDIA NIM
 * (2026-08-30), two image parts in one prompt returns:
 *
 *     400  "At most 1 image(s) may be provided in one prompt."
 *
 * Sending the frames one at a time would mean N round trips and N× the quota
 * for a single question, and the model would never see two moments together —
 * so it could not answer "what changed" at all. Tiling them into one grid
 * costs one call and preserves the temporal relationship.
 *
 * Verified: a 2×2 sheet at 768×432 (36 KB JPEG) answered in 4 077 ms and the
 * model reasoned across cells — "the robot's position changes across frames" —
 * rather than describing four unrelated pictures. The timestamp stamped into
 * each cell is what makes that possible; without it the grid is just a collage.
 *
 * The sheet doubles as the transparency artefact: the image shown in the
 * inspector panel is the literal bytes sent, not a mock-up of them.
 */

export interface SheetFrame {
  at: number;         // seconds into the source
  thumb: string;      // data URL of the frame
  labels: string[];
}

export interface ContactSheet {
  dataUrl: string;
  cols: number;
  rows: number;
  count: number;
  width: number;
  height: number;
  timestamps: number[];
  bytes: number;
  /** Frames that went in, newest last — the panel lists these beside the image. */
  frames: SheetFrame[];
}

/* Grid shapes chosen so cells stay wide enough to read. A 6-cell sheet is
   3×2 rather than 6×1: a 128px-tall strip loses the detail the question is
   usually about. Above 9 frames the cells get too small to help, so the
   caller is expected to select which frames matter rather than send more. */
function gridFor(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n <= 2) return { cols: 2, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

export const MAX_SHEET_FRAMES = 9;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('frame failed to decode'));
    img.src = src;
  });

/* Build the sheet from the frames given, oldest first.
 *
 * `cellWidth` is deliberately modest. Vision models bill roughly one token per
 * 28×28 patch, so a 3×3 sheet of 384px cells is already ~1.4k image tokens;
 * doubling the cell size quadruples that for detail the model rarely uses at
 * this task. 384 was the size measured at 4.1s end to end. */
export async function buildContactSheet(
  frames: SheetFrame[],
  opts: { cellWidth?: number; quality?: number } = {},
): Promise<ContactSheet | null> {
  const picked = frames.slice(-MAX_SHEET_FRAMES);
  if (picked.length === 0) return null;

  const cellW = opts.cellWidth ?? 384;
  const quality = opts.quality ?? 0.78;
  const { cols, rows } = gridFor(picked.length);

  const first = await loadImage(picked[0].thumb);
  const aspect = first.naturalHeight / first.naturalWidth || 9 / 16;
  const cellH = Math.round(cellW * aspect);

  const canvas = document.createElement('canvas');
  canvas.width = cols * cellW;
  canvas.height = rows * cellH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Fill first: an unpainted cell in a short final row would be transparent,
  // which JPEG renders as black noise and the model reads as content.
  ctx.fillStyle = '#0a0c12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < picked.length; i++) {
    const img = i === 0 ? first : await loadImage(picked[i].thumb);
    const x = (i % cols) * cellW;
    const y = Math.floor(i / cols) * cellH;
    ctx.drawImage(img, x, y, cellW, cellH);

    /* The timestamp is what turns a collage into a sequence. It is burned into
       the pixels rather than described in the prompt so the model can bind a
       cell to a time without counting grid positions — which it does badly. */
    const tag = `t+${picked[i].at.toFixed(1)}s`;
    ctx.font = '600 15px "JetBrains Mono", ui-monospace, monospace';
    const tw = ctx.measureText(tag).width + 12;
    ctx.fillStyle = 'rgba(5,7,13,0.82)';
    ctx.fillRect(x, y, tw, 24);
    ctx.fillStyle = '#e8ecf5';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, x + 6, y + 12);

    // Cell separator, so the model does not read two adjacent frames as one
    // continuous wide image.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
  }

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const bytes = Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

  return {
    dataUrl,
    cols,
    rows,
    count: picked.length,
    width: canvas.width,
    height: canvas.height,
    timestamps: picked.map((f) => f.at),
    bytes,
    frames: picked,
  };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
