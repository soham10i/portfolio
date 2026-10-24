import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { parseBlocks, type Block, type ListBlock } from '@/features/chat/lib/markdown';

export function MarkdownText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return <>{blocks.map((b, i) => renderBlock(b, i))}</>;
}

function renderList(list: ListBlock, key: number) {
  const inner = list.items.map((item, j) => (
    <li key={j} className="my-1">
      {renderInline(item.text)}
      {item.children?.map((child, k) => renderList(child, k))}
    </li>
  ));
  return list.ordered ? (
    <ol key={key} start={list.start} className="list-decimal list-outside pl-5 space-y-1 my-1.5 text-inherit marker:text-fg3">
      {inner}
    </ol>
  ) : (
    <ul key={key} className="list-disc list-outside pl-5 space-y-1 my-1.5 text-inherit marker:text-fg3">
      {inner}
    </ul>
  );
}

function renderBlock(block: Block, key: number): React.ReactNode {
  switch (block.type) {
    case 'list':
      return renderList(block, key);
    case 'heading':
      return (
        <p key={key} className="font-semibold mt-2.5 mb-1 text-inherit">
          {renderInline(block.text)}
        </p>
      );
    case 'hr':
      return <hr key={key} className="my-2.5 border-line opacity-50" />;
    default: {
      const trimmed = block.text.trim();
      // Block math equation ($$...$$)
      if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
        const mathContent = trimmed.slice(2, -2).trim();
        return (
          <div key={key} className="my-2.5 p-3 rounded-xl bg-[color:var(--surf2)] border border-[color:var(--line)] text-center font-mono text-[0.92em] text-fg tracking-wide overflow-x-auto shadow-sm">
            {formatMathDisplay(mathContent)}
          </div>
        );
      }
      return (
        <p key={key} className="my-1.5 text-inherit leading-relaxed">
          {renderInline(block.text)}
        </p>
      );
    }
  }
}

/** Formats mathematical symbols and sub/superscripts for visual display */
function formatMathDisplay(mathStr: string): React.ReactNode[] {
  // Convert standard LaTeX symbols into readable Unicode symbols
  const cleaned = mathStr
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\pm/g, '±')
    .replace(/\\approx/g, '≈')
    .replace(/\\le(q)?\b/g, '≤')
    .replace(/\\ge(q)?\b/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\sum/g, '∑')
    .replace(/\\int/g, '∫')
    .replace(/\\infty/g, '∞')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\theta/g, 'θ')
    .replace(/\\sigma/g, 'σ')
    .replace(/\\mu/g, 'μ')
    .replace(/\\pi/g, 'π')
    .replace(/\\omega/g, 'ω');

  // Parse superscripts and subscripts
  const parts: React.ReactNode[] = [];
  let k = 0;
  const scriptRegex = /\^\{?([a-zA-Z0-9+-]+)\}?|_\{?([a-zA-Z0-9+-]+)\}?/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = scriptRegex.exec(cleaned)) !== null) {
    if (m.index > last) {
      parts.push(<span key={k++}>{cleaned.slice(last, m.index)}</span>);
    }
    if (m[1] !== undefined) {
      parts.push(<sup key={k++} className="text-[0.75em] text-p">{m[1]}</sup>);
    } else if (m[2] !== undefined) {
      parts.push(<sub key={k++} className="text-[0.75em] opacity-80">{m[2]}</sub>);
    }
    last = scriptRegex.lastIndex;
  }

  if (last < cleaned.length) {
    parts.push(<span key={k++}>{cleaned.slice(last)}</span>);
  }

  return parts.length ? parts : [cleaned];
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let key = 0;

  // Regex matches:
  // 1: Block Math ($$...$$)
  // 2: Inline Math ($...$)
  // 3: Bold (**...**)
  // 4: Italic (*...*)
  // 5: Inline Code (`...`)
  // 6 & 7: Markdown link [label](url)
  // 8: Raw URL (https://... or github.com/... or linkedin.com/...)
  const pattern = /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$|\*\*(.+?)\*\*|(?<![*\w])\*([^*]+?)\*(?!\w)|`([^`]+?)`|\[([^\]]+)\]\(([^)]+)\)|\b(https?:\/\/[^\s<)"]+|(?:github\.com|linkedin\.com)\/[^\s<)"]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }

    if (match[1] !== undefined) {
      // Block math
      parts.push(
        <div key={key++} className="my-2 p-2.5 rounded-lg bg-[color:var(--surf2)] border border-[color:var(--line)] text-center font-mono text-[0.9em] text-fg">
          {formatMathDisplay(match[1].trim())}
        </div>
      );
    } else if (match[2] !== undefined) {
      // Inline math ($...$)
      parts.push(
        <span
          key={key++}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded font-mono text-[0.88em] bg-[color:var(--surf2)] text-p border border-[color:var(--line)] font-medium"
        >
          {formatMathDisplay(match[2].trim())}
        </span>
      );
    } else if (match[3] !== undefined) {
      // Bold
      parts.push(<strong key={key++} className="font-semibold text-inherit">{match[3]}</strong>);
    } else if (match[4] !== undefined) {
      // Italic
      parts.push(<em key={key++} className="italic text-inherit">{match[4]}</em>);
    } else if (match[5] !== undefined) {
      // Code
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded text-[0.85em] font-mono border border-line bg-surf2">{match[5]}</code>
      );
    } else if (match[6] !== undefined && match[7] !== undefined) {
      // Markdown link [Label](url)
      const label = match[6];
      const url = match[7];
      const isInternal = url.startsWith('/') || url.startsWith('#');

      if (isInternal) {
        parts.push(
          <Link
            key={key++}
            to={url}
            className="inline-flex items-center gap-0.5 font-medium text-p underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            <span>{label}</span>
          </Link>
        );
      } else {
        parts.push(
          <a
            key={key++}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-p underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            <span>{label}</span>
            <ArrowUpRight className="inline-block h-3 w-3 flex-none opacity-80" />
          </a>
        );
      }
    } else if (match[8] !== undefined) {
      // Raw URL detected
      const rawUrl = match[8];
      const href = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
      const displayLabel = rawUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

      parts.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-p underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          <span>{displayLabel}</span>
          <ArrowUpRight className="inline-block h-3 w-3 flex-none opacity-80" />
        </a>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length ? parts : [text];
}

export default MarkdownText;
