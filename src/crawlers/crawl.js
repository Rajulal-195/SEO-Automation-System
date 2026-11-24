// src/crawlers/crawl.js
// Pipeline Step 1: Fetch + Cheerio crawl of the client's URL.
// This file only FETCHES. Parsing happens in onpage.js, technical.js and schema.js.
// Nothing here ever throws: failures come back as { ok: false, error }.

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB cap per fetched document
const USER_AGENT =
  'EdgelinkSEOBot/1.0 (+https://edgelinktechnology.com; SEO audit crawler)';

const KEPT_HEADERS = [
  'content-type',
  'content-encoding',
  'x-robots-tag',
  'server',
  'cache-control',
  'strict-transport-security',
];

/** Adds https:// when missing and rejects anything that is not http(s). */
function normalizeUrl(input) {
  let value = String(input || '').trim();
  if (!value) throw new Error('URL is empty');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = 'https://' + value;

  const parsed = new URL(value); // throws on an invalid URL
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs can be audited');
  }
  return parsed.toString();
}

function describeError(err, timeoutMs) {
  if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return `Timed out after ${timeoutMs}ms`;
  }
  const code = err && err.cause && err.cause.code;
  if (code) return `${code}: ${err.cause.message || err.message}`;
  return (err && err.message) || 'Unknown fetch error';
}

/**
 * Fetches any URL as text. Used for the page itself, robots.txt and sitemaps.
 * Never throws.
 */
async function fetchText(
  url,
  { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_BODY_BYTES, accept = '*/*' } = {}
) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': USER_AGENT,
        accept,
        'accept-language': 'en-IN,en;q=0.9',
      },
    });
    const ttfbMs = Date.now() - started;

    let body = await res.text();
    const bytes = Buffer.byteLength(body);
    const truncated = bytes > maxBytes;
    if (truncated) body = body.slice(0, maxBytes);

    const headers = {};
    for (const name of KEPT_HEADERS) {
      const value = res.headers.get(name);
      if (value) headers[name] = value;
    }

    return {
      ok: res.ok,
      status: res.status,
      url,
      finalUrl: res.url || url,
      redirected: res.redirected,
      contentType: res.headers.get('content-type') || '',
      headers,
      body,
      bytes,
      truncated,
      ttfbMs,
      totalMs: Date.now() - started,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      finalUrl: url,
      redirected: false,
      contentType: '',
      headers: {},
      body: '',
      bytes: 0,
      truncated: false,
      ttfbMs: null,
      totalMs: Date.now() - started,
      error: describeError(err, timeoutMs),
    };
  }
}

/** Pipeline Step 1. Returns the raw crawl result consumed by the analyzers. */
async function crawlPage(inputUrl) {
  let url;
  try {
    url = normalizeUrl(inputUrl);
  } catch (err) {
    return {
      ok: false, status: 0, url: String(inputUrl), finalUrl: String(inputUrl),
      redirected: false, contentType: '', headers: {}, body: '', bytes: 0,
      truncated: false, ttfbMs: null, totalMs: 0, isHtml: false, error: err.message,
    };
  }

  const result = await fetchText(url, {
    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
  });
  result.isHtml = /html/i.test(result.contentType) || /<html[\s>]/i.test(result.body.slice(0, 2000));
  return result;
}

module.exports = { crawlPage, fetchText, normalizeUrl, USER_AGENT };
