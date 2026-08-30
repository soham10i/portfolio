/* Frame captioning, in priority order.
 *
 *   1. The project's own FastAPI + BLIP service, when SCENE_API_BASE is set and
 *      answering. This is the "my model, end to end" path.
 *   2. The self-hosted multimodal model (LLM_VISION_MODEL) as a fallback, so
 *      the demo still produces descriptions when the BLIP service is asleep or
 *      not yet hosted — the normal state for a free-tier ML service.
 *
 * Vision can be on a different provider than text (e.g. NVIDIA NIM for vision,
 * OpenRouter for text). The response always names the engine that answered. */
const config = require('../config');
const { callLLM, extractText } = require('./llm');

async function withBlip(bytes) {
  if (!config.scene.baseUrl) return null;
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), 'frame.jpg');
  try {
    const r = await fetch(`${config.scene.baseUrl}/process-frame`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(config.scene.timeoutMs),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const caption = d.scene_description || (d.captions && d.captions[0]) || '';
    if (!caption) return null;
    return {
      engine: 'blip',
      caption,
      confidence: typeof d.confidence_score === 'number' ? d.confidence_score : null,
      detections: Array.isArray(d.detections) ? d.detections.length : null,
      processingTime: d.processing_time ?? null,
    };
  } catch {
    return null;                       // asleep or unreachable — fall through
  }
}

/* The OpenAI vision message shape (a text part plus an image_url data URI) is
   what vLLM, llama.cpp, Ollama and LM Studio all accept for Qwen-VL, SmolVLM,
   MiniCPM-V and friends, so one code path covers whichever is running. */
async function withVlm(bytes, labels) {
  if (!config.llm.visionReady) return null;

  const hint = labels && labels.length
    ? `An object detector found: ${labels.join(', ')}. Use these as ground truth.`
    : 'No detector labels are available for this frame.';

  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: `Describe this video frame in one vivid sentence (max 28 words). ${hint} State only what is visible — no speculation about intent, mood or what happens next.` },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${bytes.toString('base64')}` } },
    ],
  }];

  try {
    const r = await callLLM({
      messages,
      model: config.llm.visionModel,
      maxTokens: 160,
      temperature: 0.4,
      timeoutMs: config.scene.timeoutMs,
      baseUrl: config.llm.visionBaseUrl,
      apiKey: config.llm.visionApiKey,
    });
    if (!r.ok) return null;
    const { text } = extractText(await r.json());
    return text ? { engine: 'vlm', caption: text, confidence: null, detections: null, processingTime: null } : null;
  } catch {
    return null;
  }
}

const caption = async (bytes, labels) => (await withBlip(bytes)) || (await withVlm(bytes, labels));

/* Is the BLIP service awake? Separate from captioning so the status endpoint
   can answer without spending a caption. */
async function blipHealth() {
  if (!config.scene.baseUrl) return { up: false, reason: 'not configured' };
  try {
    const r = await fetch(`${config.scene.baseUrl}/health`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { up: false, reason: `returned ${r.status}` };
    return { up: true, upstream: await r.json().catch(() => ({})) };
  } catch (err) {
    return { up: false, reason: err.name === 'TimeoutError' ? 'timed out' : 'unreachable' };
  }
}

module.exports = { caption, blipHealth };
