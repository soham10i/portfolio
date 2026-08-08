#!/usr/bin/env node
/**
 * Portfolio Validation & Testing Loop
 * 
 * Run this after every UI/backend change:
 *   node scripts/validate.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

const TESTS = [
  {
    name: 'Health Check',
    test: async () => {
      const res = await fetch(`${API_URL}/api/health`);
      const data = await res.json();
      if (!data.status === 'ok') throw new Error('Health check failed');
      return `✅ Backend healthy (${data.model})`;
    }
  },
  {
    name: 'Structured Project List',
    test: async () => {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'What projects has Soham built?', history: [] }),
      });
      const data = await res.json();
      const text = data.response;
      
      const hasBullets = /\*\s+\*\*[^*]+\*\*/.test(text);
      const hasBold = /\*\*[^*]+\*\*/.test(text);
      const hasAllProjects = text.includes('Digital Twin') && text.includes('Scene Understanding') && text.includes('MedQA');
      const notTooLong = text.length < 3000;
      const notCutOff = !text.endsWith('...');
      
      const checks = [
        ['Has bullet points', hasBullets],
        ['Has bold formatting', hasBold],
        ['Lists key projects', hasAllProjects],
        ['Not truncated', notCutOff],
        ['Under 3000 chars', notTooLong],
      ];
      
      const failed = checks.filter(([_, pass]) => !pass);
      if (failed.length > 0) {
        throw new Error(`Failed checks: ${failed.map(([name]) => name).join(', ')}`);
      }
      return `✅ Structured format OK (${text.length} chars)`;
    }
  },
  {
    name: 'Personality Check',
    test: async () => {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hey! Who are you?', history: [] }),
      });
      const data = await res.json();
      const text = data.response.toLowerCase();
      
      const notCorporate = !text.includes('as an ai') && !text.includes('language model');
      const hasPersonality = text.includes('sparx') || text.includes('soham') || text.includes('portfolio');
      
      if (!notCorporate) throw new Error('Response sounds too corporate/AI-like');
      if (!hasPersonality) throw new Error('Response lacks personality/identity');
      
      return `✅ Personality OK (natural tone detected)`;
    }
  },
  {
    name: 'Response Time',
    test: async () => {
      const start = Date.now();
      await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'What are Soham top skills?', history: [] }),
      });
      const ms = Date.now() - start;
      if (ms > 5000) throw new Error(`Too slow: ${ms}ms`);
      return `✅ Response time: ${ms}ms`;
    }
  },
  {
    name: 'Conciseness Check',
    test: async () => {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Tell me about Soham skills', history: [] }),
      });
      const data = await res.json();
      const wordCount = data.response.split(/\s+/).length;
      if (wordCount > 250) throw new Error(`Too verbose: ${wordCount} words`);
      return `✅ Concise: ${wordCount} words`;
    }
  }
];

async function runTests() {
  console.log('🧪 Portfolio Validation Loop\n');
  let passed = 0;
  let failed = 0;
  
  for (const { name, test } of TESTS) {
    try {
      const result = await test();
      console.log(`  ${result}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
      failed++;
    }
  }
  
  console.log(`\n${passed}/${TESTS.length} tests passed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
