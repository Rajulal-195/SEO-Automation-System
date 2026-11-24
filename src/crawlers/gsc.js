// src/crawlers/gsc.js
// Pipeline Step 3: Google Search Console (MOCKED by default).
const { USE_MOCKS } = require('../mocks');
const mockData = require('../mocks/gsc.mock');

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

async function getSearchConsole(siteUrl) {
  if (USE_MOCKS) return structuredClone(mockData);

  // ---- Real Search Console API call ----
  // Needs an OAuth access token for a Google account that owns the property.
  const token = process.env.GSC_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Search Console is not configured (set GSC_ACCESS_TOKEN, or use USE_MOCKS=true)');
  }

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: isoDaysAgo(30),
        endDate: isoDaysAgo(2),
        dimensions: ['query'],
        rowLimit: 25,
      }),
      signal: AbortSignal.timeout(30000),
    }
  );
  if (!res.ok) throw new Error(`Search Console API responded with ${res.status}`);

  const json = await res.json();
  const rows = (json.rows || []).map((r) => ({
    query: r.keys && r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));

  return {
    rows,
    totalClicks: rows.reduce((sum, r) => sum + (r.clicks || 0), 0),
    totalImpressions: rows.reduce((sum, r) => sum + (r.impressions || 0), 0),
    // Index coverage needs the URL Inspection API, which is not bulk-friendly
    indexCoverageErrors: null,
  };
}

module.exports = { getSearchConsole };
