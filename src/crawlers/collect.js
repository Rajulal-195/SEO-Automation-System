// src/crawlers/collect.js
// Runs the 7 signal-collection steps of the audit pipeline (PDF section 3.2)
// in order and returns one `signals` object. This is what the worker stores in
// Audit.signals and feeds to Claude.
//
// A failing step never stops the audit: its slot becomes
// { available: false, error } and the error is listed in signals.errors.

const { USE_MOCKS } = require('../mocks');
const { crawlPage } = require('./crawl');
const { getPageSpeed } = require('./pagespeed');
const { getSearchConsole } = require('./gsc');
const { analyzeSchema } = require('./schema');
const { analyzeOnPage } = require('./onpage');
const { analyzeTechnical } = require('./technical');
const { getRankings } = require('./dataforseo');

const STEPS = [
  'Crawling website',
  'Fetching PageSpeed Insights',
  'Fetching Search Console data',
  'Validating schema.org markup',
  'Analysing on-page SEO',
  'Checking robots.txt and sitemap',
  'Fetching keyword rankings',
];

/** Condenses the PageSpeed result into the {CWV_JSON} block for the Claude prompt. */
function buildCwv(pagespeed) {
  if (!pagespeed || pagespeed.available === false) return pagespeed || { available: false };
  const pct = (c) => (c && typeof c.score === 'number' ? Math.round(c.score * 100) : null);
  const audit = (id) => {
    const a = pagespeed.audits && pagespeed.audits[id];
    return a ? { score: a.score, value: a.displayValue || a.description || null } : null;
  };
  return {
    strategy: pagespeed.strategy,
    performanceScore: pct(pagespeed.categories && pagespeed.categories.performance),
    seoScore: pct(pagespeed.categories && pagespeed.categories.seo),
    accessibilityScore: pct(pagespeed.categories && pagespeed.categories.accessibility),
    lcp: audit('largest-contentful-paint'),
    cls: audit('cumulative-layout-shift'),
    inp: audit('interaction-to-next-paint'),
    renderBlockingResources: audit('render-blocking-resources'),
    unusedJavascript: audit('unused-javascript'),
  };
}

/**
 * @param {{ websiteUrl: string, city?: string, businessType?: string }} client
 * @param {(info: { step: number, total: number, label: string, completed: number }) => any} [onProgress]
 *        called at the START of each step; the worker maps it to Audit.progress / currentStep.
 */
async function collectSignals(client, onProgress) {
  const errors = [];
  const total = STEPS.length;
  const keyword = [client.businessType, client.city].filter(Boolean).join(' ').toLowerCase();

  async function step(index, fn) {
    const label = STEPS[index];
    if (onProgress) {
      try {
        await onProgress({ step: index + 1, total, label, completed: index });
      } catch (err) {
        console.error('[collectSignals] progress callback failed:', err.message);
      }
    }
    try {
      return await fn();
    } catch (err) {
      const code = err && err.cause && err.cause.code;
      const message = code ? `${err.message} (${code})` : err.message;
      errors.push({ step: label, message });
      return { available: false, error: message };
    }
  }

  // Step 1: crawl (kept in memory: the HTML is NOT stored in the database)
  const crawlResult = await step(0, () => crawlPage(client.websiteUrl));
  const crawl =
    crawlResult.available === false
      ? {
          ok: false, status: 0, url: client.websiteUrl, finalUrl: client.websiteUrl,
          redirected: false, contentType: '', headers: {}, body: '', bytes: 0,
          ttfbMs: null, totalMs: 0, isHtml: false, error: crawlResult.error,
        }
      : crawlResult;
  // crawlPage reports failures in the result instead of throwing
  if (crawl.error && crawlResult.available !== false) {
    errors.push({ step: STEPS[0], message: crawl.error });
  }

  // Steps 2 and 3: external APIs (mocked unless USE_MOCKS=false)
  const pagespeed = await step(1, () => getPageSpeed(client.websiteUrl));
  const gsc = await step(2, () => getSearchConsole(client.websiteUrl));

  // Steps 4 to 6: analysis of the crawl
  const schema = await step(3, async () => analyzeSchema(crawl.body));
  const onPage = await step(4, async () => analyzeOnPage(crawl, { city: client.city }));
  const technical = await step(5, () => analyzeTechnical(crawl));

  // Step 7: keyword rankings
  const rankings = await step(6, () => getRankings(client.websiteUrl, keyword));

  return {
    collectedAt: new Date().toISOString(),
    url: client.websiteUrl,
    usedMocks: USE_MOCKS,
    keyword,
    crawl: {
      ok: !!crawl.ok,
      status: crawl.status,
      finalUrl: crawl.finalUrl,
      redirected: crawl.redirected,
      contentType: crawl.contentType,
      bytes: crawl.bytes,
      ttfbMs: crawl.ttfbMs,
      totalMs: crawl.totalMs,
      error: crawl.error || null,
    },
    onPage,
    technical,
    schema,
    pagespeed,
    cwv: buildCwv(pagespeed),
    gsc,
    rankings,
    errors,
  };
}

module.exports = { collectSignals, buildCwv, STEPS };
