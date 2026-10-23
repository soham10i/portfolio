/* `npm run dev` — starts BOTH halves of the portfolio.
 *
 * The Vite dev server proxies /api to the Express backend on :3001, so the
 * chat, notes, MedQA and TTS endpoints only work when that process is also
 * running. Preview tooling (and most people) run `npm run dev` and nothing
 * else — which used to mean a site whose assistant answered "Could not reach
 * the assistant." Now the command starts the backend too.
 *
 * CLI arguments (host, port, …) are forwarded to Vite untouched. If :3001
 * already answers — scripts/dev.sh running, for example — the backend is not
 * spawned twice. The child processes die with this one. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend');

let backendUp = false;
try {
  backendUp = (await fetch('http://localhost:3001/api/health')).ok;
} catch {
  backendUp = false;
}

let back = null;
if (!backendUp) {
  back = spawn(process.execPath, ['server.js'], { cwd: backendDir, stdio: 'inherit' });
  back.on('error', (e) => console.error('[dev] backend failed to start:', e.message));
} else {
  console.log('[dev] backend already answering on :3001 — not spawning another');
}

const viteBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const vite = spawn(viteBin, ['vite', ...process.argv.slice(2)], { stdio: 'inherit' });

const stop = () => { vite.kill(); back?.kill(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.on('exit', (code) => { back?.kill(); process.exit(code ?? 0); });
