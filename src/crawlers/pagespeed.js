// src/crawlers/pagespeed.js
// Pipeline Step 2: Google PageSpeed Insights (MOCKED by default).
const { USE_MOCKS } = require('../mocks');
const mockData = require('../mocks/pagespeed.mock');

const AUDIT_IDS = [
  'largest-contentful-paint',
  'cumulative-layout-shift',
  'interaction-to-next-paint',
  'render-blocking-resources',
  'unused-javascript',
  'total-blocking-time',
  'first-contentful-paint',
  'speed-index',
];

async function getPageSpeed(url) {
  if (USE_MOCKS) return structuredClone(mockData);

  // ---- Real PageSpeed Insights API call (optional PAGESPEED_API_KEY) ----
  const params = new URLSearchParams({ url, strategy: 'mobile' });
  for (const category of ['performance', 'seo', 'accessibility']) {
    params.append('category', category);
  }
  if (process.env.PAGESPEED_API_KEY) params.set('key', process.env.PAGESPEED_API_KEY);

  const res = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
    { signal: AbortSignal.timeout(60000) }
  );
  if (!res.ok) throw new Error(`PageSpeed API responded with ${res.status}`);

  const lighthouse = (await res.json()).lighthouseResult;
  if (!lighthouse) throw new Error('PageSpeed API returned no lighthouseResult');

  // Normalise to the same shape as pagespeed.mock.js
  const categories = {};
  for (const name of ['performance', 'seo', 'accessibility']) {
    const c = lighthouse.categories && lighthouse.categories[name];
    if (c) categories[name] = { score: c.score };
  }
  const audits = {};
  for (const id of AUDIT_IDS) {
    const a = lighthouse.audits && lighthouse.audits[id];
    if (a) audits[id] = { score: a.score, displayValue: a.displayValue || null };
  }
  return { url, strategy: 'mobile', categories, audits };
}

module.exports = { getPageSpeed };
