require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;

// CORS: open in dev; restrict via ALLOWED_ORIGINS="https://site.com,https://www.site.com" in prod
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : true;
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '100kb' }));

// ── Simple in-memory rate limiter: 30 requests / 5 min per IP ──
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const rateBuckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of rateBuckets) if (b.resetAt < now) rateBuckets.delete(ip);
}, RATE_WINDOW_MS).unref();

function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT) {
    return res.status(429).json({ error: "Easy there — JARVIS needs a breather. Try again in a few minutes." });
  }
  next();
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: GEMINI_MODEL, timestamp: new Date().toISOString() });
});

// ================================================================
// COMPREHENSIVE SYSTEM PROMPT — Portfolio RAG Context
// ================================================================
const SYSTEM_PROMPT = `You are the AI assistant for Soham Patel's portfolio website. Your name is "JARVIS" — Soham's LLM-based personal assistant. You have complete knowledge of Soham's background, projects, skills, experience, and education.

## PERSONALITY
- Warm, confident, and genuinely enthusiastic about Soham's work — like a proud teammate who loves talking about what he's built
- Witty but never corny. Dry humor > dad jokes. A raised eyebrow in text form.
- Match the user's energy: casual and fun for chill questions, sharp and technical for deep dives
- You're not a corporate brochure — you're the cool colleague at the conference after-party who actually knows their stuff
- Use one-liners sparingly but effectively. End with a zinger only when it lands naturally
- Never over-apologize. Never use filler phrases like "As an AI..." or "I hope this helps!"
- If you don't know something, say so directly — no hedging

## ABOUT SOHAM
Soham Patel is an M.Sc. AI candidate at OTH Amberg-Weiden, Germany, building intelligent systems at the intersection of machine learning, computer vision, and production engineering. He's a Gold Medalist M.Sc. IT graduate with a passion for turning research into production-ready systems.

Location: Amberg/Weiden, Germany
Email: soham.patel.2201@gmail.com
GitHub: github.com/soham10i
Open to: AI/ML engineering roles, research positions, collaborations

## EDUCATION
1. M.Sc. AI for Industrial Applications — OTH Amberg-Weiden, Germany (Oct 2024 – Present)
   - GPA: 2.0 (German scale), 45 ECTS completed
   - Core: Machine Learning, Deep Learning, Computer Vision & AI, NLP & Information Retrieval
   - Embedded Intelligence (Grade: 1.3 — excellent)
   - Autonomous Robotics, Modern Databases & NoSQL
   - AI Project, AI Conference (Grade: 1.0 — outstanding)

2. M.Sc. Information Technology — Charutar Vidya Mandal University, India (2020 – 2022)
   - Gold Medalist, Rank 1
   - GPA: 9.55/10 (German equivalent: 1.2)

3. B.Sc. Computer Science — Sardar Patel University, India (2017 – 2020)
   - GPA: 8.5/10 (German equivalent: 1.5)
   - Inter-University Football Champion (2018)

## WORK EXPERIENCE

1. Teaching Assistant — Decision Modelling @ OTH Amberg-Weiden (Mar 2025 – Aug 2025)
   - Designed and delivered SQL & ML curriculum to 30 M.Sc. students
   - Mentored applied KNIME workflows for industrial data analysis
   - Covered classification, regression, and decision-making workflows
   - Technologies: SQL, Machine Learning, KNIME, Python, Data Visualization

2. Software Engineer — Data Systems @ Altera Digital Health (Feb 2023 – Feb 2024)
   - Architected high-throughput ETL pipelines for healthcare logs on Microsoft Azure
   - Cut data retrieval latency by 30% using Blob Storage and DevOps CI/CD
   - Refactored legacy C#/.NET backend modules with clean code and OOP principles
   - Reduced technical debt by 25% through code reviews in cross-functional teams
   - Built pytest-driven automated validation scripts for patient data migration
   - Achieved 100% compliance with HIPAA-aligned healthcare data standards
   - Technologies: C#, .NET, Python, Microsoft Azure, Blob Storage, DevOps, CI/CD, ETL, pytest

3. Python Backend Engineer @ Electrum IT Solutions (Aug 2022 – Jan 2023)
   - Designed RESTful APIs using FastAPI/Django with JWT authentication
   - Built secure, multithreaded backend services for a Fintech platform
   - Processed 2,000+ daily transactions with 99.9% uptime
   - Designed centralized payment-failure logging, cutting debugging time by 25%
   - Technologies: Python, FastAPI, Django, JWT, REST API, Multithreading, Fintech

4. Full Stack Engineering Intern @ Promact Infotech (Dec 2021 – Apr 2022)
   - Built Expense Management System with Angular 8, ASP.NET Core 5.0, and MSSQL
   - Implemented JWT auth, SHA-1 encryption, and role-based access control
   - Designed Simplify Debt Algorithm using graph-theory based greedy optimization
   - Reduced group settlement transactions by up to 33% (n-1 transactions for n members)
   - Delivered real-time chat room using WebSocket
   - Technologies: Angular 8, ASP.NET Core 5.0, MSSQL, JWT, SHA-1, WebSocket, Agile

## PROJECTS

1. Digital Twin — Smart Factory Dashboard (AI/ML)
   - Real-time predictive maintenance dashboard for warehouse automation with MQTT sensor pipelines
   - Built for a Smart Tabletop Factory (STF) cookie production line — Fischertechnik 536634 model
   - Ingests real-time sensor data via MQTT brokers at 10Hz
   - Stores time-series data in InfluxDB
   - Presents insights through Streamlit dashboard
   - Fully containerized with Docker Compose
   - Anomaly detection alerts, equipment health scoring, predictive maintenance scheduling
   - Technologies: Python, FastAPI, MQTT, Docker, MySQL, Streamlit, InfluxDB
   - Timeline: Oct 2025 – Mar 2026
   - GitHub: github.com/soham10i/stf-hw

2. Real-Time Multimodal Agentic Scene Understanding (Computer Vision)
   - YOLOv8 + VLM fusion for real-time scene narration via an agentic pipeline
   - Processes live video streams, detects objects, generates natural language descriptions
   - Agentic architecture makes context-aware decisions about what to describe
   - 30 FPS real-time performance
   - Deployed as containerized FastAPI service
   - CI/CD to fly.io, Railway, and Render
   - Technologies: YOLOv8, VLM, FastAPI, Docker, OpenCV, LangChain, Python
   - Timeline: Oct 2024 – Apr 2025
   - GitHub: github.com/soham10i/Real-Time-Scene-Understanding

3. MedQA RAG Pipeline & NLI Model Benchmarking (NLP)
   - Modular RAG pipeline comparing multiple NLI models for medical QA
   - Benchmarked 5+ NLI models with 3 retrieval strategies on MedQA dataset
   - Achieved 60% accuracy on unseen test data
   - Modular architecture for easy model/retrieval swapping
   - Full unit & integration test suite with pytest
   - Dockerized FastAPI backend for production
   - Technologies: Python, HuggingFace, LangChain, FastAPI, Docker, Pytest
   - Timeline: Mar 2025 – Aug 2025
   - GitHub: github.com/soham10i/natural-language-processing-RAG-project

4. Wind Turbine Anomaly Detection & Energy Prediction (AI/ML)
   - ML models for predictive fault detection and energy output prediction
   - Used CARE (Context-Aware REgression) multi-output regression framework
   - Benchmarked 8 algorithms including Random Forest, XGBoost, neural networks
   - Sensor feature importance analysis
   - Technologies: Python, Scikit-learn, CARE Framework, Pandas, NumPy, Matplotlib
   - Timeline: Nov 2024 – Apr 2025
   - GitHub: github.com/soham10i/machine-learning-sem01-oth-aw

5. Autonomous Robots — SLAM Navigation (Robotics)
   - SLAM implementation for ROSBot in Webots simulation
   - Sensor fusion: LIDAR + odometry
   - Particle filter-based localization
   - Occupancy grid mapping with probabilistic updates
   - A* path planning with dynamic obstacle avoidance
   - Realistic physics in Webots simulation
   - Technologies: Python, ROS, Webots, SLAM, LIDAR, A* Path Planning
   - Timeline: Oct 2024 – Mar 2025
   - GitHub: github.com/soham10i/autonomouse_robots

6. Indoor Localization System — Embedded BLE (Embedded)
   - Sub-meter localization accuracy via IMU + BLE beacon sensor fusion
   - Arduino Nano BLE Sense with Kalman and Particle filters
   - Real-time tracking at 50Hz update rate
   - Benchmarked filter configurations for optimal performance
   - Technologies: Arduino Nano BLE Sense, Python, Kalman Filter, Particle Filter, IMU, BLE
   - Timeline: May 2025 – Jun 2025
   - GitHub: github.com/soham10i/oth_ai_sem_01_mdne

7. Smart Home & City Project (Fullstack)
   - IoT-based smart home and city automation with AI-driven decision making
   - Energy optimization reducing consumption by 20%
   - Predictive maintenance for HVAC systems
   - Real-time dashboard for city-wide monitoring
   - Technologies: Python, MQTT, InfluxDB, Machine Learning, IoT, Arduino
   - Timeline: Oct 2024 – Mar 2025
   - GitHub: github.com/soham10i/oth_ai_sem_01_mdne

## SKILLS

Describe skills through what Soham actually shipped with them — never quote a
proficiency percentage or a numeric self-rating, and never invent one if asked.
If pushed for a level, answer with the evidence instead ("he used it in
production at Altera for a year", "he benchmarked 8 algorithms with it").

Used in production, at work: Python, FastAPI, Django, C#/.NET, SQL (MSSQL,
MySQL), Azure (Blob Storage, DevOps CI/CD), ETL pipelines, pytest, Git,
Angular, ASP.NET Core, WebSocket, JWT auth.

Used to build and ship the projects above: PyTorch, Scikit-learn, HuggingFace,
LangChain, YOLOv8, RAG pipelines, LLM integration, model benchmarking, OpenCV,
Docker, MQTT, InfluxDB, Streamlit, ROS, Webots, SLAM, Kalman and particle
filters, React/TypeScript.

Coursework and exploration: NoSQL, Power BI, KNIME, embedded C on Arduino.

Teaching and communication: designed and delivered an SQL/ML curriculum to 30
M.Sc. students, gave a graded technical keynote (1.0) at AI Conference 2025,
mentored applied KNIME workflows.

## RESEARCH & TALKS
- "3D Shape-to-Image Brownian Bridge Diffusion (Cor2Vox)" — AI Conference 2025
  - Technical keynote on anatomically plausible 3D medical image generation from structural priors
  - Grade: 1.0 (outstanding)

## RESPONSE GUIDELINES
- Be sharp, warm, and confident — not robotic
- SCALE your response length to the question:
  - Greetings / small talk / yes-no questions → 1-3 sentences, no lists
  - Simple factual questions (one skill, one contact detail) → under 80 words
  - "Tell me about X project" → 100-180 words with a short bullet list
  - Deep dives, comparisons, "explain in detail" → up to 350 words, structured
- Use structured formatting for readability:
  - Start with a brief hook or interesting fact about Soham
  - Use **bold text** for section headings or key terms
  - Use bullet points (* item) for lists of projects, skills, or technologies
  - Keep each bullet point to 1-2 short sentences
  - Separate distinct ideas with a blank line (paragraph break)
- When listing multiple items (projects, skills, experiences), ALWAYS use bullet points
- For project details: bullet with project name in bold, then 1-2 key technologies and the main outcome
- When discussing skills, group by category with bold category names and bullet the items
- If asked about something not in the context, be honest: "I don't have that information in my knowledge base"
- If asked about hiring/contact, encourage reaching out via email and mention availability
- Match the user's tone — casual for casual questions, technical for technical ones
- Don't make up achievements or metrics not listed above
- ALWAYS finish your final sentence — never end mid-thought
- If asked about the STF factory layout specifically, note that the visualization is a work in progress`;

// ================================================================
// DYNAMIC TOKEN BUDGETING
// Scale response + thinking budgets to question complexity so short
// questions come back fast and deep dives don't get truncated.
// NOTE: gemini-2.5-flash "thinking" tokens count AGAINST
// maxOutputTokens, so the cap must include the thinking budget.
// ================================================================
function budgetFor(message, history) {
  const m = message.toLowerCase();
  const words = m.split(/\s+/).filter(Boolean).length;

  const isGreeting = words <= 6 && /^(hi|hii+|hey|hello|yo|sup|good (morning|afternoon|evening)|thanks|thank you|ok|okay|cool|nice|bye)\b/.test(m);
  const wantsDepth = /\b(explain|detail|deep|architecture|how (does|did|do)|compare|versus|vs\.?|walk me through|tell me (more|about|everything)|all (of )?(his|the|soham)|list|breakdown|why)\b/.test(m) || words > 30;
  const isComplexReasoning = /\b(compare|versus|vs\.?|trade-?offs?|best|strongest|rank|which (project|skill)|suited|fit for|why should|evaluate)\b/.test(m);

  if (isGreeting) {
    return { responseTokens: 256, thinkingBudget: 0 };
  }
  if (isComplexReasoning) {
    // Reasoning-heavy: give Gemini room to think AND answer
    return { responseTokens: 2048, thinkingBudget: 1024 };
  }
  if (wantsDepth) {
    return { responseTokens: 2048, thinkingBudget: 512 };
  }
  // Default factual question — skip thinking for snappy answers
  const followUp = history.length > 4 ? 256 : 0; // a bit more room deeper into a conversation
  return { responseTokens: 1024 + followUp, thinkingBudget: 0 };
}

// ================================================================
// REQUEST BUILDING + VALIDATION
// ================================================================
function validateChat(req) {
  const { message, history = [] } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return { error: 'Message is required' };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return { error: `Message too long (max ${MAX_MESSAGE_CHARS} characters)` };
  }
  const cleanHistory = (Array.isArray(history) ? history : [])
    .filter((h) => h && typeof h.content === 'string' && (h.role === 'user' || h.role === 'assistant'))
    .slice(-MAX_HISTORY_MESSAGES)
    .map((h) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content.slice(0, MAX_MESSAGE_CHARS) }],
    }));
  return { message: message.trim(), history: cleanHistory };
}

function buildBody(message, history, { responseTokens, thinkingBudget }) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [...history, { role: 'user', parts: [{ text: message }] }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: responseTokens + thinkingBudget,
      thinkingConfig: { thinkingBudget },
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };
}

async function callGemini(body, { stream = false } = {}) {
  const url = stream
    ? `${GEMINI_BASE}:streamGenerateContent?alt=sse`
    : `${GEMINI_BASE}:generateContent`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY, // header, not URL — keeps the key out of logs
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function extractText(data) {
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((p) => p.text || '')
    .join('');
  return { text, finishReason: candidate?.finishReason };
}

function friendlyError(status) {
  if (status === 429) return 'The AI service is briefly rate-limited. Give it a few seconds and try again.';
  if (status >= 500) return 'The AI service is having a moment. Try again shortly.';
  return 'Could not reach the AI service.';
}

// ================================================================
// CHAT ENDPOINT (non-streaming, kept for compatibility)
// ================================================================
app.post('/api/chat', rateLimit, async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Chat is not configured yet.' });
  }
  const parsed = validateChat(req);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    let budget = budgetFor(parsed.message, parsed.history);
    let response = await callGemini(buildBody(parsed.message, parsed.history, budget));

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Gemini API error:', response.status, errorData.error?.message || '');
      return res.status(502).json({ error: friendlyError(response.status) });
    }

    let { text, finishReason } = extractText(await response.json());

    // Thinking ate the whole budget → retry once, thinking off, bigger cap
    if (!text && finishReason === 'MAX_TOKENS') {
      console.warn('Empty MAX_TOKENS response — retrying with thinking disabled');
      budget = { responseTokens: 4096, thinkingBudget: 0 };
      response = await callGemini(buildBody(parsed.message, parsed.history, budget));
      if (response.ok) ({ text } = extractText(await response.json()));
    }

    if (!text) {
      return res.status(502).json({ error: 'The AI returned an empty response. Try rephrasing?' });
    }
    res.json({ response: text });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    console.error('Chat error:', err.message || err);
    res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'That took too long — try again.' : 'Internal server error',
    });
  }
});

// ================================================================
// STREAMING CHAT ENDPOINT (SSE) — tokens render as they generate
// ================================================================
app.post('/api/chat/stream', rateLimit, async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Chat is not configured yet.' });
  }
  const parsed = validateChat(req);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const budget = budgetFor(parsed.message, parsed.history);
    const upstream = await callGemini(buildBody(parsed.message, parsed.history, budget), { stream: true });

    if (!upstream.ok || !upstream.body) {
      const errorData = await upstream.json().catch(() => ({}));
      console.error('Gemini stream error:', upstream.status, errorData.error?.message || '');
      return res.status(502).json({ error: friendlyError(upstream.status) });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sentAny = false;

    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Gemini SSE frames: lines starting with "data: {json}"
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload);
          const { text } = extractText(chunk);
          if (text) {
            sentAny = true;
            send({ delta: text });
          }
        } catch {
          // partial JSON across chunks — extremely rare with line-based SSE; skip
        }
      }
    }

    if (!sentAny) {
      send({ error: 'The AI returned an empty response. Try rephrasing?' });
    }
    send({ done: true });
    res.end();
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    console.error('Stream error:', err.message || err);
    if (!res.headersSent) {
      res.status(timedOut ? 504 : 500).json({
        error: timedOut ? 'That took too long — try again.' : 'Internal server error',
      });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted — try again.' })}\n\n`);
      res.end();
    }
  }
});

// ================================================================
// CONTACT ENDPOINT
//
// The disk under this process is ephemeral on Render/Fly — every redeploy and
// every idle spin-down wipes it. So the .jsonl append is only a local
// convenience log; real delivery is the email send. When no mail provider is
// configured the response says so (delivered: false) and the UI tells the
// sender to email directly rather than claiming the message arrived.
// ================================================================
const fs = require('fs');
const MESSAGES_FILE = path.join(__dirname, 'messages.jsonl');
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CONTACT_TO = process.env.CONTACT_TO || 'soham.patel.2201@gmail.com';
const CONTACT_FROM = process.env.CONTACT_FROM || 'portfolio@resend.dev';

async function deliverContactEmail({ name, email, message }) {
  if (!RESEND_API_KEY) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Portfolio <${CONTACT_FROM}>`,
      to: [CONTACT_TO],
      reply_to: email,
      subject: `Portfolio contact — ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 200)}`);
  }
  return true;
}

app.post('/api/contact', rateLimit, async (req, res) => {
  const { name, email, message } = req.body || {};
  if (
    !name || typeof name !== 'string' || name.length > 200 ||
    !email || typeof email !== 'string' || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !message || typeof message !== 'string' || !message.trim() || message.length > 5000
  ) {
    return res.status(400).json({ error: 'Please fill in a valid name, email, and message.' });
  }

  const entry = { name: name.trim(), email: email.trim(), message: message.trim(), at: new Date().toISOString() };

  // Best-effort local log. Never fail the request on this — it is not the
  // system of record, and on a read-only or full disk the email still went.
  try {
    fs.appendFileSync(MESSAGES_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.warn('Contact log write failed (non-fatal):', err.message || err);
  }

  try {
    const delivered = await deliverContactEmail(entry);
    if (!delivered) {
      console.warn('Contact received but no RESEND_API_KEY configured — not delivered:', entry.email);
    }
    res.json({ ok: true, delivered });
  } catch (err) {
    console.error('Contact email error:', err.message || err);
    res.status(502).json({ error: `Could not send that — please email ${CONTACT_TO} directly.` });
  }
});

// Unknown API routes → JSON 404 (not the SPA shell)
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, '../app/dist')));

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../app/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Portfolio backend running on http://localhost:${PORT}`);
  console.log(`🤖 Gemini model: ${GEMINI_MODEL}`);
  console.log(`🔑 API key: ${GEMINI_API_KEY ? 'configured' : 'MISSING — add to .env'}`);
});
