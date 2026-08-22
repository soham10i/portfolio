import { useMemo } from 'react';
import { parseBlocks, type Block, type ListBlock } from '@/lib/markdown';

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
    default:
      return (
        <p key={key} className="my-1.5 text-inherit leading-relaxed">
          {renderInline(block.text)}
        </p>
      );
  }
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let key = 0;
  const pattern = /\*\*(.+?)\*\*|(?<![*\w])\*([^*]+?)\*(?!\w)|`([^`]+?)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1] !== undefined) {
      parts.push(<strong key={key++} className="font-semibold text-inherit">{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<em key={key++} className="italic text-inherit">{match[2]}</em>);
    } else if (match[3] !== undefined) {
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded text-[0.85em] font-mono border border-line bg-surf2">{match[3]}</code>
      );
    } else if (match[4] !== undefined && match[5] !== undefined) {
      parts.push(
        <a key={key++} href={match[5]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-p hover:opacity-80">
          {match[4]}
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
