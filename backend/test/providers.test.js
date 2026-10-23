/* Unit tests for the provider registry (src/config/providers.js).
   Run: npm test (node --test). No network — resolve() takes an injected env. */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { PROVIDERS, resolve } = require('../src/config/providers');

/* The same wiring config/index.js uses for the text role. */
const TEXT_ENVS = {
  providerEnv: 'LLM_PROVIDER',
  baseEnv: 'LLM_API_BASE',
  modelEnv: 'LLM_MODEL',
  keyEnv: 'LLM_API_KEY',
};

test('registry: every preset has a base URL, a model id and matching key env', () => {
  for (const [name, p] of Object.entries(PROVIDERS)) {
    assert.ok(p.baseUrl.startsWith('http'), `${name}: baseUrl`);
    assert.ok(p.model, `${name}: model`);
    if (p.keyEnv) assert.match(p.keyEnv, /_API_KEY$/, `${name}: keyEnv`);
  }
});

test('resolve: provider name selects the preset, key comes from its env', () => {
  const r = resolve({ ...TEXT_ENVS, env: { LLM_PROVIDER: 'groq', GROQ_API_KEY: 'gsk_test' } });
  assert.equal(r.provider, 'groq');
  assert.equal(r.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(r.model, 'openai/gpt-oss-120b');
  assert.equal(r.apiKey, 'gsk_test');
});

test('resolve: provider name is case- and whitespace-insensitive', () => {
  const r = resolve({ ...TEXT_ENVS, env: { LLM_PROVIDER: '  Groq\n', GROQ_API_KEY: 'k' } });
  assert.equal(r.provider, 'groq');
});

test('resolve: explicit LLM_API_BASE / LLM_MODEL override the preset', () => {
  const r = resolve({
    ...TEXT_ENVS,
    env: {
      LLM_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'k',
      LLM_API_BASE: 'http://192.168.1.10:8000/v1/',  // trailing slash stripped
      LLM_MODEL: 'my-fine-tune',
    },
  });
  assert.equal(r.baseUrl, 'http://192.168.1.10:8000/v1');
  assert.equal(r.model, 'my-fine-tune');
  assert.equal(r.apiKey, 'k', 'preset key env still applies');
});

test('resolve: explicit LLM_API_KEY wins over the preset key env', () => {
  const r = resolve({
    ...TEXT_ENVS,
    env: { LLM_PROVIDER: 'groq', GROQ_API_KEY: 'from-preset', LLM_API_KEY: 'explicit' },
  });
  assert.equal(r.apiKey, 'explicit');
});

test('resolve: unknown provider name resolves to empty, never throws', () => {
  // A deploy with no (or a mistyped) provider must still serve the site;
  // chat answers 503 instead of crashing the process.
  const r = resolve({ ...TEXT_ENVS, env: { LLM_PROVIDER: 'does-not-exist' } });
  assert.deepEqual(r, { provider: null, baseUrl: '', model: '', apiKey: '' });
});

test('resolve: no configuration at all resolves to empty', () => {
  const r = resolve({ ...TEXT_ENVS, env: {} });
  assert.deepEqual(r, { provider: null, baseUrl: '', model: '', apiKey: '' });
});

test('resolve: vision role uses visionModel; null means none, not a wrong guess', () => {
  const nvidia = resolve({
    providerEnv: 'LLM_VISION_PROVIDER',
    baseEnv: 'LLM_VISION_API_BASE',
    modelEnv: 'LLM_VISION_MODEL',
    keyEnv: 'LLM_VISION_API_KEY',
    role: 'vision',
    env: { LLM_VISION_PROVIDER: 'nvidia', NVIDIA_API_KEY: 'nv' },
  });
  assert.equal(nvidia.model, 'meta/llama-3.2-11b-vision-instruct');
  assert.equal(nvidia.apiKey, 'nv');

  // Groq serves no vision model — visionModel is null on purpose, so the
  // role must resolve to empty rather than invent a captioning model.
  const groqVision = resolve({
    providerEnv: 'LLM_VISION_PROVIDER',
    baseEnv: 'LLM_VISION_API_BASE',
    modelEnv: 'LLM_VISION_MODEL',
    keyEnv: 'LLM_VISION_API_KEY',
    role: 'vision',
    env: { LLM_VISION_PROVIDER: 'groq', GROQ_API_KEY: 'g' },
  });
  assert.equal(groqVision.model, '');
});

test('resolve: keyless providers (ollama) yield an empty apiKey', () => {
  const r = resolve({ ...TEXT_ENVS, env: { LLM_PROVIDER: 'ollama' } });
  assert.equal(r.provider, 'ollama');
  assert.equal(r.apiKey, '');
  assert.equal(r.baseUrl, 'http://127.0.0.1:11434/v1');
});
