// src/crawlers/technical.js
// Pipeline Step 6: robots.txt + sitemap.xml check (plus basic technical signals).
// Output becomes {TECHNICAL_JSON} in the Claude prompt.

const cheerio = require('cheerio');
const { fetchText } = require('./crawl');

const SIDE_FETCH_TIMEOUT_MS = 8000;
const MAX_SITEMAPS_CHECKED = 3;

/** Servers often answer 200 with an HTML "not found" page. Treat that as missing. */
function looksLikeHtml(body) {
  return /^\s*<(!doctype|html|head|body)/i.test(body || '');
}

function parseRobots(body) {
  const sitemaps = [];
  const disallowAll = []; // Disallow rules under "User-agent: *"
  let appliesToAll = false;
  let inGroup = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      // a new user-agent line right after rules starts a new group
      if (!inGroup) appliesToAll = false;
      if (value === '*') appliesToAll = true;
      inGroup = true;
    } else if (key === 'sitemap') {
      if (value) sitemaps.push(value);
    } else {
      inGroup = false;
      if (key === 'disallow' && appliesToAll && value) disallowAll.push(value);
    }
  }

  return {
    sitemaps,
    disallowRules: disallowAll.length,
    blocksEntireSite: disallowAll.includes('/'),
  };
}

async function checkRobots(origin) {
  const res = await fetchText(origin + '/robots.txt', {
    timeoutMs: SIDE_FETCH_TIMEOUT_MS,
    accept: 'text/plain,*/*;q=0.5',
  });

  if (res.error) {
    return { url: res.url, exists: false, status: 0, error: res.error, sitemaps: [] };
  }
  if (!res.ok || !res.body.trim() || looksLikeHtml(res.body)) {
    return {
      url: res.url,
      exists: false,
      status: res.status,
      error: res.ok ? 'Returned an HTML page instead of robots.txt' : null,
      sitemaps: [],
    };
  }

  return { url: res.url, exists: true, status: res.status, error: null, ...parseRobots(res.body) };
}

async function checkSitemapUrl(url) {
  const res = await fetchText(url, {
    timeoutMs: SIDE_FETCH_TIMEOUT_MS,
    accept: 'application/xml,text/xml,*/*;q=0.5',
  });

  const base = { url, status: res.status, error: res.error, exists: false, valid: false, type: null, urlCount: 0 };
  if (res.error || !res.ok || !res.body.trim()) return base;
  if (looksLikeHtml(res.body)) return { ...base, error: 'Returned an HTML page instead of XML' };

  base.exists = true;
  try {
    const $ = cheerio.load(res.body, { xml: true });
    const urlCount = $('urlset > url').length;
    const indexCount = $('sitemapindex > sitemap').length;
    if ($('urlset').length) return { ...base, valid: true, type: 'urlset', urlCount };
    if ($('sitemapindex').length) return { ...base, valid: true, type: 'sitemapindex', urlCount: indexCount };
    return { ...base, error: 'XML has no <urlset> or <sitemapindex> element' };
  } catch (err) {
    return { ...base, error: 'XML could not be parsed: ' + err.message };
  }
}

async function checkSitemap(origin, declared) {
  const declaredInRobots = declared.length > 0;
  const candidates = declaredInRobots
    ? declared.slice(0, MAX_SITEMAPS_CHECKED)
    : [origin + '/sitemap.xml'];

  let last = null;
  for (const url of candidates) {
    last = await checkSitemapUrl(url);
    if (last.valid) break;
  }
  return { declaredInRobots, ...last };
}

async function analyzeTechnical(crawl) {
  let origin = null;
  try { origin = new URL(crawl.finalUrl || crawl.url).origin; } catch (_) { /* handled below */ }

  const base = {
    reachable: !!crawl && !crawl.error && crawl.status > 0,
    status: crawl ? crawl.status : 0,
    error: crawl ? crawl.error : 'No crawl result',
    finalUrl: crawl ? crawl.finalUrl : null,
    redirected: crawl ? crawl.redirected : false,
    isHttps: /^https:/i.test((crawl && crawl.finalUrl) || ''),
    ttfbMs: crawl ? crawl.ttfbMs : null,
    totalMs: crawl ? crawl.totalMs : null,
    htmlBytes: crawl ? crawl.bytes : 0,
    compression: (crawl && crawl.headers && crawl.headers['content-encoding']) || null,
    hsts: !!(crawl && crawl.headers && crawl.headers['strict-transport-security']),
    xRobotsTag: (crawl && crawl.headers && crawl.headers['x-robots-tag']) || null,
  };
  base.noindexHeader = !!(base.xRobotsTag && /noindex/i.test(base.xRobotsTag));

  if (!origin) {
    return { ...base, robotsTxt: null, sitemap: null };
  }

  const robotsTxt = await checkRobots(origin);
  const sitemap = await checkSitemap(origin, robotsTxt.sitemaps || []);
  return { ...base, robotsTxt, sitemap };
}

module.exports = { analyzeTechnical };
