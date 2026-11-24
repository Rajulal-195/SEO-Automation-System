// src/crawlers/dataforseo.js
// Pipeline Step 7: DataForSEO keyword rankings (MOCKED by default).
const { USE_MOCKS } = require('../mocks');
const mockData = require('../mocks/dataforseo.mock');

function stripWww(host) {
  return String(host || '').replace(/^www\./i, '').toLowerCase();
}

async function getRankings(websiteUrl, keyword) {
  if (USE_MOCKS) return structuredClone(mockData);

  // ---- Real DataForSEO call (costs money per request) ----
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error('DataForSEO is not configured (set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD, or use USE_MOCKS=true)');
  }

  const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      { keyword, location_name: 'India', language_name: 'English', depth: 20 },
    ]),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`DataForSEO responded with ${res.status}`);

  const json = await res.json();
  const items = (((json.tasks || [])[0] || {}).result || [])[0]?.items || [];
  const organic = items
    .filter((i) => i.type === 'organic')
    .map((i) => ({
      type: 'organic',
      rank_group: i.rank_group,
      rank_absolute: i.rank_absolute,
      domain: i.domain,
    }));

  const clientHost = stripWww(new URL(websiteUrl).hostname);
  const mine = organic.find((i) => stripWww(i.domain) === clientHost);

  // Same shape as dataforseo.mock.js
  return {
    tasks: [{ result: [{ keyword, items: organic.slice(0, 10) }] }],
    client_rank_position: mine ? mine.rank_absolute : null,
    keyword_search_volume: null, // needs the Keywords Data endpoint
  };
}

module.exports = { getRankings };
