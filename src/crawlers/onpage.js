// src/crawlers/onpage.js
// Pipeline Step 5: On-page analysis. Pure function: crawl result in, JSON out.
// This output becomes {ON_PAGE_JSON} in the Claude prompt.

const cheerio = require('cheerio');

const GENERIC_ANCHORS = new Set([
  'click here', 'read more', 'learn more', 'more', 'here', 'link', 'this page', 'know more',
]);

function stripWww(host) {
  return host.replace(/^www\./i, '').toLowerCase();
}

function textOrNull(value) {
  const t = (value || '').replace(/\s+/g, ' ').trim();
  return t || null;
}

function analyzeOnPage(crawl, { city } = {}) {
  if (!crawl || !crawl.body || !crawl.isHtml) {
    return {
      crawled: false,
      reason: crawl && crawl.error ? crawl.error : 'No HTML content was returned',
    };
  }

  const $ = cheerio.load(crawl.body);
  const baseUrl = crawl.finalUrl || crawl.url;
  let baseHost = '';
  try { baseHost = stripWww(new URL(baseUrl).hostname); } catch (_) { /* keep empty */ }

  // ---- Title and meta ----
  const titleText = textOrNull($('head > title').first().text() || $('title').first().text());
  const descText = textOrNull($('meta[name="description" i]').attr('content'));
  const canonicalHref = textOrNull($('link[rel="canonical" i]').attr('href'));

  let canonicalIsSelf = null;
  if (canonicalHref) {
    try {
      const a = new URL(canonicalHref, baseUrl);
      const b = new URL(baseUrl);
      canonicalIsSelf =
        stripWww(a.hostname) === stripWww(b.hostname) &&
        a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '');
    } catch (_) { canonicalIsSelf = null; }
  }

  // ---- Headings ----
  const levels = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => levels.push(Number(el.tagName.slice(1))));
  let skippedLevels = 0;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) skippedLevels++;
  }
  const h1Texts = $('h1').map((_, el) => textOrNull($(el).text())).get().filter(Boolean);

  // ---- Visible word count ----
  const bodyClone = $('body').clone();
  bodyClone.find('script, style, noscript, template').remove();
  const visibleText = bodyClone.text().replace(/\s+/g, ' ').trim();
  const wordCount = visibleText ? visibleText.split(' ').length : 0;

  // ---- Images ----
  const images = $('img');
  let missingAlt = 0, emptyAlt = 0, withoutDimensions = 0, lazyLoaded = 0;
  images.each((_, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined) missingAlt++;
    else if (alt.trim() === '') emptyAlt++;
    if (!$(el).attr('width') || !$(el).attr('height')) withoutDimensions++;
    if (($(el).attr('loading') || '').toLowerCase() === 'lazy') lazyLoaded++;
  });

  // ---- Links ----
  let internal = 0, external = 0, nofollow = 0, emptyAnchor = 0, genericAnchor = 0;
  let telLinks = 0, mailtoLinks = 0;
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return;
    if (/^tel:/i.test(href)) { telLinks++; return; }
    if (/^mailto:/i.test(href)) { mailtoLinks++; return; }

    const label = textOrNull($(el).text());
    const hasImgAlt = textOrNull($(el).find('img').attr('alt'));
    const ariaLabel = textOrNull($(el).attr('aria-label'));
    if (!label && !hasImgAlt && !ariaLabel) emptyAnchor++;
    if (label && GENERIC_ANCHORS.has(label.toLowerCase())) genericAnchor++;
    if (/nofollow/i.test($(el).attr('rel') || '')) nofollow++;

    try {
      const target = new URL(href, baseUrl);
      if (stripWww(target.hostname) === baseHost) internal++;
      else external++;
    } catch (_) { /* ignore malformed hrefs */ }
  });

  // ---- Local business signals ----
  const mapsEmbed = $('iframe[src*="google.com/maps"], iframe[src*="maps.google"]').length > 0;
  const cityMentioned = city ? visibleText.toLowerCase().includes(String(city).toLowerCase()) : null;

  // ---- Mixed content (http:// resources on an https page) ----
  const isHttps = /^https:/i.test(baseUrl);
  let mixedContentCount = 0;
  if (isHttps) {
    mixedContentCount = $('img[src^="http://"], script[src^="http://"], link[href^="http://"][rel="stylesheet"], iframe[src^="http://"]').length;
  }

  return {
    crawled: true,
    url: baseUrl,
    title: { text: titleText, length: titleText ? titleText.length : 0 },
    metaDescription: { text: descText, length: descText ? descText.length : 0 },
    canonical: { href: canonicalHref, isSelfReferencing: canonicalIsSelf },
    metaRobots: textOrNull($('meta[name="robots" i]').attr('content')),
    viewport: textOrNull($('meta[name="viewport" i]').attr('content')),
    htmlLang: textOrNull($('html').attr('lang')),
    charset: textOrNull($('meta[charset]').attr('charset')),
    headings: {
      h1Count: $('h1').length,
      h1Texts: h1Texts.slice(0, 5),
      h2Count: $('h2').length,
      h3Count: $('h3').length,
      skippedLevels,
    },
    wordCount,
    images: {
      total: images.length,
      missingAlt,
      emptyAlt,
      withoutDimensions,
      lazyLoaded,
    },
    links: { internal, external, nofollow, emptyAnchor, genericAnchor },
    social: {
      ogTitle: !!$('meta[property="og:title"]').attr('content'),
      ogDescription: !!$('meta[property="og:description"]').attr('content'),
      ogImage: !!$('meta[property="og:image"]').attr('content'),
      twitterCard: !!$('meta[name="twitter:card"]').attr('content'),
    },
    hreflangCount: $('link[rel="alternate"][hreflang]').length,
    hasFavicon: $('link[rel~="icon" i]').length > 0,
    local: {
      telLinks,
      mailtoLinks,
      googleMapsEmbed: mapsEmbed,
      cityMentioned,
      hasAddressTag: $('address').length > 0,
    },
    security: { isHttps, mixedContentCount },
  };
}

module.exports = { analyzeOnPage };
