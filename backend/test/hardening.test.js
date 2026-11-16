const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { serialiseNote, parseNote } = require('../src/services/notesStore');

test('note frontmatter: a newline in the title cannot add or override fields', () => {
  const raw = serialiseNote({ title: 'Real\nupdated: 1999-01-01', summary: 's\r\ntopic: Evil', topic: 'T', tags: 'a\nb', body: 'x' });
  const note = parseNote(raw, 'demo');
  assert.strictEqual(note.topic, 'T');
  assert.notStrictEqual(note.updated, '1999-01-01');
  assert.strictEqual(note.title, 'Real updated: 1999-01-01');
});

test('API answers malformed JSON with a JSON 400, not an HTML page', async (t) => {
  const port = 3900 + Math.floor(Math.random() * 90);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development', ADMIN_TOKEN: '', LLM_API_BASE: '' },
    stdio: 'ignore',
  });
  t.after(() => child.kill());
  let res;
  for (let i = 0; i < 40 && !res; i++) {
    try {
      res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json',
      });
    } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  assert.ok(res, 'server did not start');
  assert.strictEqual(res.status, 400);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.deepStrictEqual(await res.json(), { error: 'Malformed JSON.' });
});
