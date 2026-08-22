/**
 * Minimal block-level Markdown parser for chat responses.
 *
 * Written line-based rather than by splitting on blank lines, because
 * LLM output routinely separates list items with blank lines. A
 * block-splitting parser turns each of those into its own list, so every
 * item renders as "1." Continuation and nested lines also have to be
 * attached to their item rather than discarded.
 *
 * Nesting uses an explicit indent stack so arbitrary depth works and a
 * marker change (bullets then numbers under one parent) opens a sibling
 * sub-list instead of replacing — replacing silently ate content.
 *
 * Pure data in, pure data out — no JSX — so it can be unit-tested.
 */

export interface ListItem {
  text: string;
  /** Sub-lists under this item. Multiple, so a marker switch never discards one. */
  children?: ListBlock[];
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  /** First number in the source, so <ol start> matches what the model wrote. */
  start: number;
  items: ListItem[];
}

export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'hr' }
  | ListBlock;

const ITEM_RE = /^( *)(?:(\d+)[.)]|([*\-+•]))\s+(.*)$/;
const HEADING_RE = /^ *(#{1,6})\s+(.*)$/;
const HR_RE = /^ *(?:-{3,}|_{3,}|\*{3,}) *$/;
/** Indent (in spaces) a marker must gain over its parent to count as nested. */
const NEST_INDENT = 2;

interface Frame {
  list: ListBlock;
  indent: number;
}

const trimEnd = (s: string) => s.replace(/[^\S]+$/, '');

export function parseBlocks(input: string): Block[] {
  const blocks: Block[] = [];
  const para: string[] = [];
  /** Open lists, outermost first. */
  const stack: Frame[] = [];
  let sawBlank = false;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'paragraph', text: para.join(' ') });
      para.length = 0;
    }
  };
  const closeLists = () => {
    stack.length = 0;
  };
  const top = () => (stack.length ? stack[stack.length - 1] : undefined);
  // Always created holding the item that opened it — creating it empty
  // silently dropped that first item.
  const newList = (ordered: boolean, start: number, text: string): ListBlock => ({
    type: 'list',
    ordered,
    start,
    items: [{ text }],
  });

  for (const rawLine of input.split('\n')) {
    // Tabs count as indentation; normalise so widths are comparable.
    const expanded = trimEnd(rawLine.replace(/\t/g, '    ').replace(/\r$/, ''));

    if (!expanded.trim()) {
      // A blank line ends a paragraph but NOT a list: models commonly put
      // blank lines between list items, and those must stay one list.
      flushPara();
      sawBlank = true;
      continue;
    }

    if (HR_RE.test(expanded)) {
      flushPara();
      closeLists();
      blocks.push({ type: 'hr' });
      sawBlank = false;
      continue;
    }

    const heading = HEADING_RE.exec(expanded);
    if (heading) {
      flushPara();
      closeLists();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      sawBlank = false;
      continue;
    }

    const item = ITEM_RE.exec(expanded);
    if (item) {
      flushPara();
      const indent = item[1].length;
      const ordered = item[2] !== undefined;
      const start = ordered ? parseInt(item[2], 10) : 1;
      const text = item[4].trim();

      // Dedent: close any lists indented deeper than this marker.
      while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();

      const cur = top();
      if (!cur) {
        const list = newList(ordered, start, text);
        blocks.push(list);
        stack.push({ list, indent });
      } else if (indent >= cur.indent + NEST_INDENT && cur.list.items.length) {
        // Nested under the last item of the current list.
        const parent = cur.list.items[cur.list.items.length - 1];
        const kids = (parent.children ??= []);
        const last = kids[kids.length - 1];
        if (last && last.ordered === ordered) {
          last.items.push({ text });
          stack.push({ list: last, indent });
        } else {
          const list = newList(ordered, start, text);
          kids.push(list);
          stack.push({ list, indent });
        }
      } else if (cur.list.ordered === ordered) {
        cur.list.items.push({ text });
      } else {
        // Same level, different marker: a sibling list, not a replacement.
        stack.pop();
        const parent = top();
        const list = newList(ordered, start, text);
        if (parent && parent.list.items.length) {
          const owner = parent.list.items[parent.list.items.length - 1];
          (owner.children ??= []).push(list);
        } else {
          blocks.push(list);
        }
        stack.push({ list, indent });
      }
      sawBlank = false;
      continue;
    }

    // Plain text. Directly under a list item (or indented after a blank)
    // it continues that item rather than starting a paragraph.
    const indent = expanded.length - expanded.trimStart().length;
    if (stack.length && (!sawBlank || indent >= NEST_INDENT)) {
      // Attach to the deepest list whose indent this line still sits inside.
      while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
      const cur = top()!;
      const items = cur.list.items;
      if (items.length) {
        const owner = items[items.length - 1];
        owner.text = `${owner.text} ${expanded.trim()}`.trim();
        sawBlank = false;
        continue;
      }
    }

    closeLists();
    para.push(expanded.trim());
    sawBlank = false;
  }

  flushPara();
  return blocks;
}
