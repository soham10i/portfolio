/* Markdown + LaTeX rendering for the study notes.
 *
 * marked and KaTeX are vendored under /vendor rather than added to
 * package.json, for the same reason three.js and onnxruntime-web are: the site
 * must render with no CDN reachable, and the notes route should not push the
 * main bundle up for visitors who never open it. Both are loaded on demand the
 * first time a note is rendered.
 *
 * The order of operations matters. Markdown and TeX fight over the same
 * characters — `_` becomes emphasis, `*` becomes bold, `\\` collapses — so the
 * maths is lifted out into placeholders BEFORE marked sees the text and put
 * back as rendered HTML afterwards. Running KaTeX over marked's output instead
 * (the usual auto-render approach) mangles every subscript in a derivation. */

declare global {
  interface Window {
    marked?: { parse(src: string, opts?: Record<string, unknown>): string };
    katex?: { renderToString(tex: string, opts?: Record<string, unknown>): string };
  }
}

const MARKED_JS = '/vendor/marked.min.js';
const KATEX_JS = '/vendor/katex/katex.min.js';
const KATEX_CSS = '/vendor/katex/katex.min.css';

let loading: Promise<void> | null = null;

function injectScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-vendor="${src}"]`);
    if (existing) {
      if (existing.dataset.ready) resolve();
      else existing.addEventListener('load', () => resolve());
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.dataset.vendor = src;
    el.onload = () => { el.dataset.ready = '1'; resolve(); };
    el.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(el);
  });
}

function injectStyle(href: string) {
  if (document.querySelector(`link[data-vendor="${href}"]`)) return;
  const el = document.createElement('link');
  el.rel = 'stylesheet';
  el.href = href;
  el.dataset.vendor = href;
  document.head.appendChild(el);
}

/** Load marked + KaTeX once; every later call reuses the same promise. */
export function loadRenderers(): Promise<void> {
  if (!loading) {
    injectStyle(KATEX_CSS);
    loading = Promise.all([injectScript(MARKED_JS), injectScript(KATEX_JS)]).then(() => undefined);
  }
  return loading;
}

/* A placeholder that survives markdown untouched: no punctuation marked treats
   as syntax, and a shape that cannot occur in ordinary prose. */
const token = (i: number) => `xmathplaceholderx${i}x`;

interface Chunk { tex: string; display: boolean }

/** Lift $$…$$ and $…$ out of the source, leaving placeholders behind. */
function extractMath(src: string): { text: string; chunks: Chunk[] } {
  const chunks: Chunk[] = [];
  let text = '';
  let i = 0;

  while (i < src.length) {
    // Fenced and inline code are verbatim zones — never touch maths inside them
    if (src.startsWith('```', i)) {
      const end = src.indexOf('```', i + 3);
      const stop = end === -1 ? src.length : end + 3;
      text += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      const stop = end === -1 ? src.length : end + 1;
      text += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (src[i] === '\\' && src[i + 1] === '$') {   // an escaped literal dollar
      text += '$';
      i += 2;
      continue;
    }
    if (src.startsWith('$$', i)) {
      const end = src.indexOf('$$', i + 2);
      if (end !== -1) {
        chunks.push({ tex: src.slice(i + 2, end), display: true });
        text += token(chunks.length - 1);
        i = end + 2;
        continue;
      }
    }
    if (src[i] === '$') {
      const end = src.indexOf('$', i + 1);
      /* A lone $ in prose ("$5 a month") must stay a dollar sign, so the span
         has to look like maths: non-empty, no blank line inside, and short.
         Single newlines ARE allowed — an author wrapping a paragraph should not
         have to keep an inline formula on one line. */
      const inner = end === -1 ? '' : src.slice(i + 1, end);
      if (end !== -1 && inner.trim() && !/\n\s*\n/.test(inner) && inner.length <= 240) {
        chunks.push({ tex: inner, display: false });
        text += token(chunks.length - 1);
        i = end + 1;
        continue;
      }
    }
    text += src[i];
    i += 1;
  }
  return { text, chunks };
}

/**
 * Render a note body to HTML.
 * Throws only if the vendored libraries cannot be loaded; a broken formula
 * renders as red inline TeX rather than taking the whole page down.
 */
export async function renderNote(src: string): Promise<string> {
  await loadRenderers();
  const { marked, katex } = window;
  if (!marked || !katex) throw new Error('Renderer unavailable');

  const { text, chunks } = extractMath(src);
  let html = marked.parse(text, { gfm: true, breaks: false });

  chunks.forEach((c, idx) => {
    let piece: string;
    try {
      piece = katex.renderToString(c.tex.trim(), {
        displayMode: c.display,
        throwOnError: false,
        strict: false,
        trust: false,
        macros: { '\\E': '\\mathbb{E}', '\\N': '\\mathcal{N}' },
      });
    } catch {
      piece = `<code class="math-error">${c.tex.replace(/[<>&]/g, '')}</code>`;
    }
    if (c.display) piece = `<div class="math-display">${piece}</div>`;
    // split/join, not replace(): a `$` inside the rendered TeX would otherwise
    // be read as a replacement pattern by String.replace.
    html = html.split(token(idx)).join(piece);
  });

  /* marked 12 does not emit heading ids, so the table of contents has nothing
     to anchor to. Add them here with exactly the slug outline() computes. */
  html = html.replace(/<(h[23])>([\s\S]*?)<\/\1>/g, (_m, tag, inner) => {
    const text = String(inner).replace(/<[^>]*>/g, '').trim();
    return `<${tag} id="${slugifyHeading(text)}">${inner}</${tag}>`;
  });

  return html;
}

/** Headings, for the sidebar table of contents. */
export interface Heading { id: string; text: string; level: number }

export function outline(src: string): Heading[] {
  const out: Heading[] = [];
  let inFence = false;
  for (const line of src.split('\n')) {
    if (line.trimStart().startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.*)$/.exec(line);
    if (!m) continue;
    const text = m[2].replace(/[*_`$\\]/g, '').replace(/\{[^}]*\}/g, '').trim();
    out.push({ id: slugifyHeading(text), text, level: m[1].length });
  }
  return out;
}

/** Must match the id marked assigns, so the TOC anchors actually land. */
export function slugifyHeading(text: string): string {
  return text.toLowerCase().trim()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\- ]+/g, '')
    .replace(/\s+/g, '-');
}

/** Plain-text opening, for list previews when no summary is set. */
export function excerpt(body: string, max = 180): string {
  const flat = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[#>*_`$]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}
