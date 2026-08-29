/* MedQA RAG Service
 * Ports the user's Python pipeline to Node.js with authenticated-source fallback:
 *   1. Load question → 2. Entity extraction → 3. Embed query
 *   4. Retrieve evidence from local corpus → 5. [FALLBACK] Scrape PubMed/FDA/WHO
 *   6. Generate answer with LLM + NLI verification
 *   7. Attach medical disclaimer
 */
const fs = require('fs');
const path = require('path');
const { pipeline } = require('@xenova/transformers');
const { callLLM, extractText } = require('./llm');
const { augmentEvidence } = require('./medicalScraper');

const INDEX_PATH = path.join(__dirname, '..', '..', 'data', 'medqa-index.json');

const MEDICAL_DISCLAIMER =
  'This system provides educational information only and is not a substitute for professional medical advice, diagnosis, or treatment. ' +
  'Always seek the advice of a qualified healthcare provider with any questions you may have regarding a medical condition. ' +
  'Never disregard professional medical advice or delay in seeking it because of information provided by this system. ' +
  'In case of a medical emergency, call your local emergency number immediately.';

let embedder = null;
let index = null;
let indexReady = false;

/* ------------------------------------------------------------------ */
/* Index loading                                                       */

async function loadIndex() {
  if (indexReady) return;
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error('MedQA index not found. Run: node scripts/prepare-medqa.js');
  }

  const raw = fs.readFileSync(INDEX_PATH, 'utf-8');
  index = JSON.parse(raw);

  embedder = await pipeline('feature-extraction', index.meta.model, {
    quantized: true,
  });

  indexReady = true;
  console.log(`[MedQA] Index loaded: ${index.meta.count} records, ${index.meta.dims}d`);
}

function getStatus() {
  return {
    ready: indexReady,
    count: index?.meta?.count ?? 0,
    model: index?.meta?.model ?? null,
    dims: index?.meta?.dims ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* Vector math                                                         */

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/* ------------------------------------------------------------------ */
/* Simple entity extraction (lightweight, no spaCy)                    */

const MEDICAL_TERMS = new Set([
  'diabetes', 'hypertension', 'myocardial', 'infarction', 'pneumonia',
  'hepatitis', 'cirrhosis', 'nephritis', 'glomerulonephritis', 'asthma',
  'tuberculosis', 'meningitis', 'encephalitis', 'sepsis', 'anemia',
  'leukemia', 'lymphoma', 'carcinoma', 'sarcoma', 'melanoma',
  'osteoporosis', 'arthritis', 'gout', 'lupus', 'scleroderma',
  'epilepsy', 'parkinson', 'alzheimer', 'multiple sclerosis',
  'migraine', 'stroke', 'aneurysm', 'embolism', 'thrombosis',
  'insulin', 'metformin', 'warfarin', 'heparin', 'aspirin',
  'penicillin', 'cephalosporin', 'tetracycline', 'erythromycin',
  'prednisone', 'hydrocortisone', 'dexamethasone',
  'furosemide', 'hydrochlorothiazide', 'spironolactone',
  'atenolol', 'metoprolol', 'propranolol', 'amlodipine',
  'lisinopril', 'enalapril', 'captopril', 'losartan',
  'omeprazole', 'ranitidine', 'famotidine',
  'morphine', 'fentanyl', 'tramadol', 'acetaminophen',
  'amoxicillin', 'azithromycin', 'ciprofloxacin',
  'levothyroxine', 'methimazole', 'propylthiouracil',
  'pancreas', 'liver', 'kidney', 'spleen', 'thyroid',
  'adrenal', 'pituitary', 'hypothalamus', 'cerebellum',
  'esophagus', 'stomach', 'duodenum', 'jejunum', 'ileum',
  'colon', 'rectum', 'appendix', 'gallbladder',
  'aorta', 'vena cava', 'pulmonary', 'coronary',
  'atrium', 'ventricle', 'septum', 'valve',
  'neuron', 'synapse', 'axon', 'dendrite', 'myelin',
  'hemoglobin', 'plasma', 'platelet', 'leukocyte', 'erythrocyte',
]);

function extractEntities(text) {
  const entities = new Set();
  const words = text.toLowerCase().split(/[^a-z]+/);
  for (const w of words) {
    if (MEDICAL_TERMS.has(w)) entities.add(w);
  }
  const lower = text.toLowerCase();
  for (const term of MEDICAL_TERMS) {
    if (term.includes(' ') && lower.includes(term)) entities.add(term);
  }
  return Array.from(entities);
}

/* ------------------------------------------------------------------ */
/* Retrieval                                                           */

async function embedText(text) {
  const out = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

function retrieveTopK(queryVec, k = 5) {
  const scored = index.vectors
    .map((v) => ({ record: index.records[v.id], score: cosineSim(queryVec, v.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return scored;
}

/* ------------------------------------------------------------------ */
/* Prompt builders                                                     */

function buildRagPrompt(question, options, evidence, externalEvidence) {
  const optsText = Object.entries(options)
    .map(([k, v]) => `${k}. ${v}`)
    .join('\n');

  const localEvidenceText = evidence
    .map((e, i) => `[Evidence ${i + 1}] (score: ${e.score.toFixed(3)})\nQ: ${e.record.question}\nA: ${e.record.answer}`)
    .join('\n\n');

  let externalText = '';
  if (externalEvidence && externalEvidence.length > 0) {
    externalText = '\n\n## Additional Evidence from Certified Sources\n' +
      externalEvidence.map((e, i) => `[External ${i + 1}] Source: ${e.source}\nTitle: ${e.title}\n${e.snippet || ''}`).join('\n\n');
  }

  return `You are a medical expert assistant. Answer the following multiple-choice medical question using the retrieved evidence below.

## Retrieved Evidence (Local Corpus)
${localEvidenceText}${externalText}

## Question
${question}

## Options
${optsText}

IMPORTANT MEDICAL DISCLAIMER: This answer is for educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider for personal medical concerns.

Instructions:
1. Analyze each option against the evidence.
2. Select the single best answer.
3. Explain your reasoning briefly.
4. Output ONLY a JSON object with keys: "answer" (the letter), "explanation" (string), "confidence" (0-1).

JSON:`;
}

function buildNliPrompt(question, predictedAnswer, evidence, externalEvidence) {
  const evidenceText = evidence
    .map((e) => `- ${e.record.question} → ${e.record.answer}`)
    .join('\n');

  let extText = '';
  if (externalEvidence && externalEvidence.length > 0) {
    extText = '\n- External: ' + externalEvidence.map((e) => `${e.title} (${e.source})`).join('; ');
  }

  return `Verify whether the predicted answer is supported by the retrieved medical evidence.

## Question
${question}

## Predicted Answer
${predictedAnswer}

## Retrieved Evidence
${evidenceText}${extText}

Instructions:
1. Rate: "entails" (supported), "contradicts" (against), or "neutral" (insufficient info).
2. Provide a brief justification.
3. Output ONLY a JSON object with keys: "verdict" (string), "justification" (string), "confidence" (0-1).

JSON:`;
}

/* ------------------------------------------------------------------ */
/* Main RAG pipeline                                                   */

async function ask({ question, options, topK = 5, doNli = true, useExternal = true }) {
  const t0 = Date.now();
  await loadIndex();

  const trace = [];
  const pushStep = (name, detail, duration = 0) => {
    trace.push({ step: name, detail, duration, at: Date.now() - t0 });
  };

  /* 1. Entity extraction */
  const t1 = Date.now();
  const entities = extractEntities(question + ' ' + Object.values(options).join(' '));
  pushStep('entity_extraction', { entities, method: 'lexical' }, Date.now() - t1);

  /* 2. Embed query */
  const t2 = Date.now();
  const queryVec = await embedText(question);
  pushStep('embedding', { model: index.meta.model, dims: queryVec.length }, Date.now() - t2);

  /* 3. Retrieve evidence */
  const t3 = Date.now();
  const evidence = retrieveTopK(queryVec, topK);
  pushStep('retrieval', {
    topK,
    scores: evidence.map((e) => ({ id: e.record.id, score: +e.score.toFixed(4) })),
  }, Date.now() - t3);

  /* 4. External source fallback (PubMed / FDA / WHO) */
  let external = { used: false, reason: 'skipped', external: [] };
  if (useExternal) {
    const t3b = Date.now();
    external = await augmentEvidence(question, entities, evidence);
    if (external.used) {
      pushStep('external_search', {
        reason: external.reason,
        queries: external.queries,
        resultsCount: external.external.length,
        sources: external.external.reduce((acc, r) => {
          acc[r.source] = (acc[r.source] || 0) + 1;
          return acc;
        }, {}),
      }, Date.now() - t3b);
    }
  }

  /* 5. LLM generation (RAG) */
  const t4 = Date.now();
  const ragPrompt = buildRagPrompt(question, options, evidence, external.external);
  let generated = null;
  let genError = null;
  try {
    const res = await callLLM({
      messages: [
        { role: 'system', content: 'You are a precise medical reasoning assistant. Always respond with valid JSON only. Remember: your output is educational, not diagnostic.' },
        { role: 'user', content: ragPrompt },
      ],
      maxTokens: 1024,
      temperature: 0.3,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = await res.json();
    const { text } = extractText(data);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    generated = jsonMatch ? JSON.parse(jsonMatch[0]) : { answer: '?', explanation: text, confidence: 0.5 };
  } catch (err) {
    genError = err.message;
    generated = { answer: '?', explanation: 'Generation failed: ' + err.message, confidence: 0 };
  }
  pushStep('generation', {
    model: index.meta.model,
    error: genError,
    answer: generated.answer,
    confidence: generated.confidence,
  }, Date.now() - t4);

  /* 6. NLI verification */
  let nli = null;
  if (doNli && !genError) {
    const t5 = Date.now();
    const nliPrompt = buildNliPrompt(question, generated.answer, evidence, external.external);
    try {
      const res = await callLLM({
        messages: [
          { role: 'system', content: 'You are a medical fact-checker. Respond with valid JSON only.' },
          { role: 'user', content: nliPrompt },
        ],
        maxTokens: 512,
        temperature: 0.1,
      });
      if (!res.ok) throw new Error(`NLI HTTP ${res.status}`);
      const data = await res.json();
      const { text } = extractText(data);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      nli = jsonMatch ? JSON.parse(jsonMatch[0]) : { verdict: 'unknown', justification: text, confidence: 0.5 };
    } catch (err) {
      nli = { verdict: 'error', justification: err.message, confidence: 0 };
    }
    pushStep('nli_verification', {
      verdict: nli.verdict,
      confidence: nli.confidence,
    }, Date.now() - t5);
  }

  /* 7. Option similarity scores */
  const t6 = Date.now();
  const optionScores = {};
  for (const [key, text] of Object.entries(options)) {
    const combined = `${question} [SEP] ${text}`;
    const vec = await embedText(combined);
    let maxSim = 0;
    for (const ev of evidence) {
      const evVec = index.vectors.find((v) => v.id === ev.record.id)?.vector;
      if (evVec) {
        const sim = cosineSim(vec, evVec);
        if (sim > maxSim) maxSim = sim;
      }
    }
    optionScores[key] = +maxSim.toFixed(4);
  }
  const bestBySim = Object.entries(optionScores).sort((a, b) => b[1] - a[1])[0]?.[0] || '?';
  pushStep('similarity_scoring', { scores: optionScores, best: bestBySim }, Date.now() - t6);

  const totalTime = Date.now() - t0;

  return {
    question,
    options,
    entities,
    evidence: evidence.map((e) => ({
      id: e.record.id,
      question: e.record.question,
      answer: e.record.answer,
      score: +e.score.toFixed(4),
    })),
    external: external.used ? external.external : [],
    externalMeta: external.used ? { reason: external.reason, queries: external.queries } : null,
    generated: {
      ...generated,
      disclaimer: MEDICAL_DISCLAIMER,
    },
    nli,
    similarity: { scores: optionScores, best: bestBySim },
    trace,
    totalTime,
    disclaimer: MEDICAL_DISCLAIMER,
  };
}

/* ------------------------------------------------------------------ */
/* Follow-up support                                                   */

const conversations = new Map();

function getConversation(sessionId) {
  if (!conversations.has(sessionId)) {
    conversations.set(sessionId, { history: [], lastResult: null });
  }
  return conversations.get(sessionId);
}

async function followUp({ sessionId, question, topK = 5 }) {
  const conv = getConversation(sessionId);
  const t0 = Date.now();
  await loadIndex();

  const contextQuery = conv.history.length > 0
    ? `${conv.history.map((h) => h.q).join(' ')} ${question}`
    : question;

  const queryVec = await embedText(contextQuery);
  const evidence = retrieveTopK(queryVec, topK);

  const historyPrompt = conv.history
    .map((h, i) => `Q${i + 1}: ${h.q}\nA${i + 1}: ${h.a}`)
    .join('\n\n');

  const prompt = `You are a medical expert assistant having a continuing conversation.

## Previous Conversation
${historyPrompt}

## New Question
${question}

## Retrieved Evidence
${evidence.map((e, i) => `[${i + 1}] ${e.record.question} → ${e.record.answer}`).join('\n')}

IMPORTANT: This response is for educational purposes only and is not a substitute for professional medical advice. Always consult a qualified healthcare provider.

Provide a helpful, accurate response. If the question refers to previous context, use it.
Output JSON with keys: "answer" (string), "explanation" (string), "confidence" (0-1).

JSON:`;

  let generated = null;
  try {
    const res = await callLLM({
      messages: [
        { role: 'system', content: 'You are a precise medical reasoning assistant. Always respond with valid JSON only. Remember: your output is educational, not diagnostic.' },
        { role: 'user', content: prompt },
      ],
      maxTokens: 1024,
      temperature: 0.3,
    });
    const data = await res.json();
    const { text } = extractText(data);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    generated = jsonMatch ? JSON.parse(jsonMatch[0]) : { answer: text, explanation: '', confidence: 0.5 };
  } catch (err) {
    generated = { answer: 'Error: ' + err.message, explanation: '', confidence: 0 };
  }

  conv.history.push({ q: question, a: generated.answer });
  if (conv.history.length > 6) conv.history = conv.history.slice(-6);

  return {
    question,
    evidence: evidence.map((e) => ({
      id: e.record.id,
      question: e.record.question,
      answer: e.record.answer,
      score: +e.score.toFixed(4),
    })),
    generated: {
      ...generated,
      disclaimer: MEDICAL_DISCLAIMER,
    },
    trace: [
      { step: 'context_assembly', detail: { historyLength: conv.history.length - 1 }, duration: Date.now() - t0 },
      { step: 'retrieval', detail: { topK, scores: evidence.map((e) => +e.score.toFixed(4)) } },
      { step: 'generation', detail: { answer: generated.answer, confidence: generated.confidence } },
    ],
    totalTime: Date.now() - t0,
    disclaimer: MEDICAL_DISCLAIMER,
  };
}

module.exports = { loadIndex, getStatus, ask, followUp, getConversation };
