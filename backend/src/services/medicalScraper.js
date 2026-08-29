/* medicalScraper.js
 * Retrieves medical information from authenticated/certified sources:
 *   - PubMed (NCBI E-utilities) — peer-reviewed biomedical literature
 *   - FDA openFDA — drug labels, adverse events, recalls
 *   - WHO Global Health Observatory — health statistics & facts
 *
 * All sources are official APIs (no raw web scraping). Results are cached
 * in-memory to respect rate limits and reduce latency.
 */

const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes
const cache = new Map(); // key → { data, fetchedAt }

function cacheKey(source, query) {
  return `${source}::${query.toLowerCase().trim()}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, fetchedAt: Date.now() });
}

/* ------------------------------------------------------------------ */
/* PubMed (NCBI E-utilities)                                          */

async function searchPubMed(query, maxResults = 5) {
  const key = cacheKey('pubmed', query);
  const cached = getCached(key);
  if (cached) return cached;

  try {
    // Step 1: Search for IDs
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchRes.ok) throw new Error(`PubMed search HTTP ${searchRes.status}`);
    const searchData = await searchRes.json();
    const ids = searchData.esearchresult?.idlist || [];
    if (ids.length === 0) return [];

    // Step 2: Fetch summaries
    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(8000) });
    if (!summaryRes.ok) throw new Error(`PubMed summary HTTP ${summaryRes.status}`);
    const summaryData = await summaryRes.json();

    const results = ids.map((id) => {
      const doc = summaryData.result?.[id] || {};
      return {
        source: 'PubMed',
        id,
        title: doc.title || 'Untitled',
        authors: (doc.authors || []).map((a) => a.name).join(', '),
        journal: doc.source || '',
        year: doc.pubdate?.split(' ')?.[0] || '',
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        snippet: doc.title || '',
      };
    });

    setCache(key, results);
    return results;
  } catch (err) {
    console.error('[MedicalScraper] PubMed error:', err.message);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* FDA openFDA                                                        */

async function searchFDA(query, limit = 3) {
  const key = cacheKey('fda', query);
  const cached = getCached(key);
  if (cached) return cached;

  try {
    const url = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      if (res.status === 404) return []; // No results
      throw new Error(`FDA HTTP ${res.status}`);
    }
    const data = await res.json();
    const results = (data.results || []).map((r, i) => ({
      source: 'FDA',
      id: r.id || `fda-${i}`,
      title: r.openfda?.brand_name?.[0] || r.openfda?.generic_name?.[0] || 'FDA Drug Label',
      snippet: (r.indications_and_usage?.[0] || r.purpose?.[0] || '').substring(0, 500),
      url: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm`,
    }));

    setCache(key, results);
    return results;
  } catch (err) {
    console.error('[MedicalScraper] FDA error:', err.message);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* WHO Global Health Observatory                                      */

async function searchWHO(query) {
  const key = cacheKey('who', query);
  const cached = getCached(key);
  if (cached) return cached;

  try {
    // WHO GHO API: search for indicators
    const url = `https://ghoapi.azureedge.net/api/Indicator?$filter=contains(IndicatorName,'${encodeURIComponent(query)}')`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`WHO HTTP ${res.status}`);
    const data = await res.json();
    const results = (data.value || [])
      .slice(0, 3)
      .map((r) => ({
        source: 'WHO',
        id: r.IndicatorCode,
        title: r.IndicatorName,
        snippet: `WHO Global Health Observatory indicator: ${r.IndicatorName}`,
        url: `https://www.who.int/data/gho/data/indicators/indicator-details/${r.IndicatorCode}`,
      }));

    setCache(key, results);
    return results;
  } catch (err) {
    console.error('[MedicalScraper] WHO error:', err.message);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Aggregated search                                                  */

async function scrapeMedical(query) {
  const [pubmed, fda, who] = await Promise.all([
    searchPubMed(query, 5),
    searchFDA(query, 3),
    searchWHO(query),
  ]);

  const all = [
    ...pubmed.map((r) => ({ ...r, type: 'literature' })),
    ...fda.map((r) => ({ ...r, type: 'drug_label' })),
    ...who.map((r) => ({ ...r, type: 'statistics' })),
  ];

  return {
    query,
    sources: {
      pubmed: pubmed.length,
      fda: fda.length,
      who: who.length,
    },
    results: all,
    fetchedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Fallback for RAG: when local corpus has low-confidence matches     */

async function augmentEvidence(question, entities, localEvidence) {
  // If we have strong local evidence, skip external search
  const topScore = localEvidence[0]?.score || 0;
  if (topScore > 0.7) {
    return { used: false, reason: 'local_corpus_sufficient', external: [] };
  }

  // Build search queries from entities + question keywords
  const queries = [
    ...entities,
    question.replace(/\b(what|which|how|why|when|where|who|is|are|the|a|an|of|in|on|with|for|to|from)\b/gi, '').trim().substring(0, 120),
  ].filter(Boolean);

  const uniqueQueries = [...new Set(queries)].slice(0, 3);
  const allExternal = [];

  for (const q of uniqueQueries) {
    const scraped = await scrapeMedical(q);
    allExternal.push(...scraped.results);
  }

  // Deduplicate by URL
  const seen = new Set();
  const deduped = allExternal.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  return {
    used: true,
    reason: topScore < 0.5 ? 'low_local_confidence' : 'moderate_local_confidence',
    queries: uniqueQueries,
    external: deduped.slice(0, 8),
  };
}

module.exports = {
  searchPubMed,
  searchFDA,
  searchWHO,
  scrapeMedical,
  augmentEvidence,
};
