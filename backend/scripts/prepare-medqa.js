/* prepare-medqa.js
 * Reads backend/data/medqa-seed.json and pre-computes embeddings with
 * Xenova/all-MiniLM-L6-v2. Writes backend/data/medqa-index.json.
 *
 * Usage: node scripts/prepare-medqa.js
 */
const fs = require('fs');
const path = require('path');
const { pipeline } = require('@xenova/transformers');

const SEED_PATH = path.join(__dirname, '..', 'data', 'medqa-seed.json');
const OUT_PATH = path.join(__dirname, '..', 'data', 'medqa-index.json');
const BATCH = 16;

async function main() {
  if (!fs.existsSync(SEED_PATH)) {
    console.error('Seed data not found at', SEED_PATH);
    process.exit(1);
  }

  const records = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
  console.log(`🌱 Loaded ${records.length} seed records`);

  console.log('🧠 Loading embedding model (Xenova/all-MiniLM-L6-v2)...');
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    quantized: true,
  });

  console.log('🔢 Computing embeddings...');
  const vectors = [];
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const texts = batch.map((r) => `${r.question} ${Object.values(r.options).join(' ')}`);
    const outputs = await embedder(texts, { pooling: 'mean', normalize: true });
    for (let j = 0; j < batch.length; j++) {
      vectors.push({ id: batch[j].id, vector: Array.from(outputs[j].data) });
    }
    process.stdout.write(`   ${Math.min(i + BATCH, records.length)} / ${records.length}\r`);
  }
  console.log(`\n   Done — ${vectors.length} vectors × ${vectors[0].vector.length} dims`);

  const payload = {
    meta: {
      model: 'Xenova/all-MiniLM-L6-v2',
      quantized: true,
      count: records.length,
      dims: vectors[0].vector.length,
      createdAt: new Date().toISOString(),
    },
    records: records.map((r) => ({
      id: r.id,
      question: r.question,
      options: r.options,
      answer: r.answer,
    })),
    vectors,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload));
  const mb = (fs.statSync(OUT_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Index written to ${OUT_PATH} (${mb} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
