/* Notes storage: one Markdown file per note, with a small frontmatter block.
 *
 * No database, no migrations, no ORM. A note is a file you can read, diff,
 * grep and commit — the right shape for something whose whole purpose is to be
 * read. The slug pattern is also the path-traversal guard: it is the only
 * thing interpolated into a filesystem path anywhere in this service. */
const fs = require('fs');
const path = require('path');
const config = require('../config');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

fs.mkdirSync(config.notes.dir, { recursive: true });

const fileFor = (slug) => path.join(config.notes.dir, `${slug}.md`);

/* Frontmatter is a flat `key: value` block, not real YAML. The fields are
   known and finite; a parser dependency for six keys is not a trade worth
   making, and hand-rolling it means no YAML deserialisation surface either. */
function parseNote(raw, slug) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  const meta = {};
  let body = raw;
  if (m) {
    body = raw.slice(m[0].length);
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title: meta.title || slug,
    summary: meta.summary || '',
    topic: meta.topic || 'Notes',
    tags: (meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    updated: meta.updated || null,
    words,
    readingMinutes: Math.max(1, Math.round(words / 190)),   // maths reads slower; this is a floor
    body,
  };
}

function serialiseNote({ title, summary, topic, tags, updated, body }) {
  const tagList = (Array.isArray(tags) ? tags : String(tags || '').split(','))
    .map((t) => String(t).trim()).filter(Boolean).join(', ');
  const fm = [
    `title: ${title}`,
    `summary: ${summary || ''}`,
    `topic: ${topic || 'Notes'}`,
    `tags: ${tagList}`,
    `updated: ${updated || new Date().toISOString()}`,
  ].join('\n');
  return `---\n${fm}\n---\n${body}`;
}

function read(slug) {
  const f = fileFor(slug);
  if (!fs.existsSync(f)) return null;
  return parseNote(fs.readFileSync(f, 'utf8'), slug);
}

function list() {
  return fs.readdirSync(config.notes.dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const n = parseNote(fs.readFileSync(path.join(config.notes.dir, f), 'utf8'), f.replace(/\.md$/, ''));
      delete n.body;
      return n;
    })
    .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
}

const exists = (slug) => fs.existsSync(fileFor(slug));
const write = (slug, draft) => fs.writeFileSync(fileFor(slug), serialiseNote(draft));
const remove = (slug) => fs.unlinkSync(fileFor(slug));

module.exports = { SLUG_RE, parseNote, serialiseNote, read, list, exists, write, remove };
