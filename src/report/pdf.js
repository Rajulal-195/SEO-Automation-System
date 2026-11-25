// src/report/pdf.js
// Pipeline step: PDF report generator.
// Pure JavaScript (PDFKit), so it behaves the same on Windows, Railway and
// Vercel. No browser or system libraries are needed.
//
//   renderReport({ client, audit })      -> Promise<Buffer>
//   generateReportFile({ client, audit }, dir) -> Promise<string>  (saves the file, returns its path)
//
// The worker calls generateReportFile (sets Audit.pdfPath); the web app's
// download route calls renderReport, so both produce the same document.

const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFKit = require('pdfkit');

const PDFDocument = PDFKit.default || PDFKit;

// ---------- layout constants (A4, points) ----------
const MARGIN_X = 48;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;
const FOOTER_RESERVE = 18;

const COLORS = {
  ink: '#111827',
  muted: '#6B7280',
  line: '#E5E7EB',
  panel: '#F8FAFC',
  brand: '#0F172A',
  accent: '#2563EB',
  good: '#16A34A',
  warn: '#D97706',
  bad: '#DC2626',
};

const PRIORITY_COLORS = {
  CRITICAL: '#DC2626',
  HIGH: '#EA580C',
  MEDIUM: '#CA8A04',
  LOW: '#64748B',
};
const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const BREAKDOWN_LABELS = [
  ['technical', 'Technical'],
  ['on_page', 'On-page'],
  ['content', 'Content'],
  ['core_web_vitals', 'Core Web Vitals'],
  ['schema', 'Schema'],
];

// ---------- text helpers ----------

/**
 * The built-in PDF fonts only cover Western characters. Replace common
 * symbols Claude may use (rupee sign, arrows, comparison signs) and drop
 * anything else that cannot be drawn, instead of printing garbage.
 */
function clean(value) {
  let s = value === null || value === undefined ? '' : String(value);
  s = s
    .replace(/\u20B9/g, 'Rs. ')
    .replace(/[\u2192\u21D2\u27F6]/g, '->')
    .replace(/[\u2190\u21D0]/g, '<-')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .replace(/\u2260/g, '!=')
    .replace(/[\u2713\u2714]/g, 'yes')
    .replace(/[\u2717\u2718]/g, 'no')
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/\t/g, ' ')
    // keep: ASCII, Latin-1 and the Windows-1252 punctuation the fonts support
    .replace(/[^\n\x20-\x7E\u00A0-\u00FF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g, '');
  return s.replace(/[ ]{2,}/g, ' ').trim();
}

/** Keeps one very long field from outgrowing a page (cards cannot split across pages). */
function clip(text, max) {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '...' : text;
}

function get(obj, pathStr, fallback) {
  const value = pathStr.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
  return value === undefined || value === null ? fallback : value;
}

function scoreColor(score) {
  if (score >= 70) return COLORS.good;
  if (score >= 50) return COLORS.warn;
  return COLORS.bad;
}

function scoreGrade(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Needs improvement';
  return 'Poor';
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  }).format(date);
}

function toList(value) {
  return Array.isArray(value) ? value.map((v) => clip(clean(v), 700)).filter(Boolean) : [];
}

function sortRecommendations(recommendations) {
  const rank = (p) => {
    const i = PRIORITY_ORDER.indexOf(String(p).toUpperCase());
    return i === -1 ? PRIORITY_ORDER.length : i;
  };
  // stable sort: Claude's order is kept inside each priority
  return recommendations
    .map((rec, index) => ({ rec, index }))
    .sort((a, b) => rank(a.rec.priority) - rank(b.rec.priority) || a.index - b.index)
    .map((x) => x.rec);
}

// ---------- the renderer ----------

function renderReport({ client, audit }) {
  const result = audit && audit.result;
  if (!result || typeof result !== 'object') {
    return Promise.reject(new Error('This audit has no analysis result to put in a report'));
  }

  const signals = (audit && audit.signals) || {};
  const score = Math.round(Number(audit.overallScore ?? result.overall_score) || 0);
  const breakdown = audit.scoreBreakdown || result.score_breakdown || {};
  const usedMocks = Boolean(signals.usedMocks);
  const auditDate = formatDate(audit.completedAt || audit.createdAt);

  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_X, right: MARGIN_X },
    info: {
      Title: clean(`SEO Audit Report - ${client.name}`),
      Author: 'Edgelink Technology',
      Subject: clean(`SEO audit for ${client.websiteUrl}`),
      Creator: 'Edgelink SEO Automation Dashboard',
      CreationDate: new Date(audit.completedAt || audit.createdAt || Date.now()),
    },
  });

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const finished = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const W = doc.page.width;
  const contentW = W - MARGIN_X * 2;
  let y = 0;

  const limit = () => doc.page.height - MARGIN_BOTTOM - FOOTER_RESERVE;
  const newPage = () => { doc.addPage(); y = MARGIN_TOP; };
  const ensure = (height) => { if (y + height > limit()) newPage(); };

  const textHeight = (text, font, size, width, lineGap = 2) => {
    doc.font(font).fontSize(size);
    return doc.heightOfString(text, { width, lineGap });
  };

  // ===== Header band =====
  doc.rect(0, 0, W, 96).fill(COLORS.brand);
  doc.fillColor('#94A3B8').font('Helvetica-Bold').fontSize(9)
    .text('EDGELINK TECHNOLOGY', MARGIN_X, 30, { characterSpacing: 2, lineBreak: false });
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(26)
    .text('SEO Audit Report', MARGIN_X, 46, { lineBreak: false });
  doc.fillColor('#CBD5E1').font('Helvetica').fontSize(10)
    .text(auditDate ? `Audit date: ${auditDate}` : '', MARGIN_X, 36, { width: contentW, align: 'right', lineBreak: false });
  doc.fillColor('#CBD5E1').fontSize(9)
    .text(`Report ID: ${clean(String(audit.id || '').slice(-8)).toUpperCase()}`, MARGIN_X, 52, { width: contentW, align: 'right', lineBreak: false });

  // ===== Client block =====
  y = 118;
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(18).text(clean(client.name), MARGIN_X, y, { width: contentW });
  y = doc.y + 2;
  doc.fillColor(COLORS.accent).font('Helvetica').fontSize(10)
    .text(clean(client.websiteUrl), MARGIN_X, y, { width: contentW, link: client.websiteUrl, underline: true });
  y = doc.y + 2;
  const meta = [client.businessType, [client.city, client.state].filter(Boolean).join(', ')].filter(Boolean).join('  |  ');
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10).text(clean(meta), MARGIN_X, y, { width: contentW, underline: false });
  y = doc.y + 18;

  // ===== Score card =====
  const cardH = 156;
  doc.roundedRect(MARGIN_X, y, contentW, cardH, 10).fillAndStroke(COLORS.panel, COLORS.line);

  const cx = MARGIN_X + 88;
  const cy = y + cardH / 2;
  const r = 52;
  const color = scoreColor(score);
  doc.lineWidth(11).lineCap('round').circle(cx, cy, r).stroke(COLORS.line);
  if (score >= 100) {
    doc.lineWidth(11).circle(cx, cy, r).stroke(color);
  } else if (score > 0) {
    const sweep = (score / 100) * 360;
    const rad = (deg) => (deg * Math.PI) / 180;
    const sx = cx + r * Math.cos(rad(-90));
    const sy = cy + r * Math.sin(rad(-90));
    const ex = cx + r * Math.cos(rad(-90 + sweep));
    const ey = cy + r * Math.sin(rad(-90 + sweep));
    doc.lineWidth(11).lineCap('round')
      .path(`M ${sx} ${sy} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${ex} ${ey}`)
      .stroke(color);
  }
  doc.lineWidth(1).lineCap('butt'); // the gauge used a thick round stroke; restore normal borders
  doc.fillColor(color).font('Helvetica-Bold').fontSize(34)
    .text(String(score), cx - 40, cy - 24, { width: 80, align: 'center', lineBreak: false });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10)
    .text('out of 100', cx - 40, cy + 14, { width: 80, align: 'center', lineBreak: false });
  doc.fillColor(color).font('Helvetica-Bold').fontSize(10)
    .text(scoreGrade(score), cx - 60, cy + r + 13, { width: 120, align: 'center', lineBreak: false });

  const bx = MARGIN_X + 190;
  const bw = contentW - 190 - 18;
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11).text('Score breakdown', bx, y + 16, { lineBreak: false });
  BREAKDOWN_LABELS.forEach(([key, label], i) => {
    const rowY = y + 42 + i * 21;
    const value = Math.max(0, Math.min(100, Math.round(Number(breakdown[key]) || 0)));
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(10).text(label, bx, rowY, { width: 100, lineBreak: false });
    const trackX = bx + 104;
    const trackW = bw - 104 - 30;
    doc.roundedRect(trackX, rowY + 1, trackW, 8, 4).fill(COLORS.line);
    if (value > 0) doc.roundedRect(trackX, rowY + 1, Math.max(8, (trackW * value) / 100), 8, 4).fill(scoreColor(value));
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(10)
      .text(String(value), trackX + trackW + 6, rowY, { width: 26, align: 'right', lineBreak: false });
  });
  y += cardH + 20;

  // ===== Section heading helper =====
  const sectionHeading = (title, barColor, followHeight = 0) => {
    ensure(34 + followHeight); // never leave a heading alone at the bottom of a page
    doc.rect(MARGIN_X, y + 1, 4, 16).fill(barColor);
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(13).text(clean(title), MARGIN_X + 12, y + 2, { width: contentW - 12, lineBreak: false });
    y += 28;
  };

  // ===== Executive summary =====
  const summary = clip(clean(result.executive_summary), 1500);
  if (summary) {
    sectionHeading('Executive summary', COLORS.accent);
    const h = textHeight(summary, 'Helvetica', 11, contentW - 28, 3) + 24;
    ensure(h);
    doc.roundedRect(MARGIN_X, y, contentW, h, 8).fill('#EFF6FF');
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(11).text(summary, MARGIN_X + 14, y + 12, { width: contentW - 28, lineGap: 3 });
    y += h + 20;
  }

  // ===== Key metrics =====
  const tiles = [
    ['Mobile performance', get(signals, 'cwv.performanceScore', null) === null ? '-' : `${signals.cwv.performanceScore}/100`],
    ['Largest Contentful Paint', clean(get(signals, 'cwv.lcp.value', '-'))],
    ['Interaction to Next Paint', clean(get(signals, 'cwv.inp.value', '-'))],
    ['Layout shift (CLS)', clean(get(signals, 'cwv.cls.value', '-'))],
    ['Search clicks', String(get(signals, 'gsc.totalClicks', '-'))],
    ['Search impressions', String(get(signals, 'gsc.totalImpressions', '-'))],
    [clean(`Rank: ${get(signals, 'keyword', 'main keyword')}`), get(signals, 'rankings.client_rank_position', null) === null ? '-' : `#${signals.rankings.client_rank_position}`],
    ['Index coverage errors', String(get(signals, 'gsc.indexCoverageErrors', '-'))],
  ];
  sectionHeading('Key metrics', COLORS.accent);
  const gap = 10;
  const tileW = (contentW - gap * 3) / 4;
  const tileH = 54;
  for (let row = 0; row < 2; row++) {
    ensure(tileH + 10);
    for (let col = 0; col < 4; col++) {
      const [label, value] = tiles[row * 4 + col];
      const tx = MARGIN_X + col * (tileW + gap);
      doc.roundedRect(tx, y, tileW, tileH, 8).fillAndStroke(COLORS.panel, COLORS.line);
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
        .text(label, tx + 10, y + 9, { width: tileW - 20, height: 20, ellipsis: true });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(15)
        .text(value || '-', tx + 10, y + 30, { width: tileW - 20, lineBreak: false, ellipsis: true });
    }
    y += tileH + 10;
  }
  y += 10;

  // ===== Bullet lists =====
  const bulletSection = (title, items, barColor) => {
    sectionHeading(title, barColor, items.length ? textHeight(items[0], 'Helvetica', 10, contentW - 24) + 8 : 22);
    if (items.length === 0) {
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(10).text('None identified.', MARGIN_X + 12, y, { lineBreak: false });
      y += 22;
      return;
    }
    items.forEach((item) => {
      const h = textHeight(item, 'Helvetica', 10, contentW - 24);
      ensure(h + 8);
      doc.rect(MARGIN_X + 12, y + 4, 5, 5).fill(barColor);
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(10).text(item, MARGIN_X + 26, y, { width: contentW - 26, lineGap: 2 });
      y += h + 8;
    });
    y += 10;
  };
  bulletSection('Critical issues', toList(result.critical_issues), COLORS.bad);
  bulletSection('Important issues', toList(result.important_issues), COLORS.warn);
  bulletSection('Quick wins (2 hours or less)', toList(result.quick_wins), COLORS.good);

  // ===== Recommendations =====
  const recs = sortRecommendations(Array.isArray(result.recommendations) ? result.recommendations : []);

  const PAD = 12;
  const innerW = contentW - PAD * 2 - 4;
  const BODY = 9.5;
  const bodyHeight = (text) => textHeight(text || '-', 'Helvetica', BODY, innerW, 1.5);
  const prepareCard = (rec) => {
    const priority = String(rec.priority || 'LOW').toUpperCase();
    const blocks = [
      ['FINDING', clip(clean(rec.finding), 1200)],
      ['FIX', clip(clean(rec.fix), 1200)],
      ['HOW WE WILL KNOW IT WORKED', clip(clean(rec.falsifiability_check), 1200)],
    ];
    let h = PAD + 16 + 8; // padding + badge row + gap
    blocks.forEach(([, text]) => { h += 10 + bodyHeight(text) + 6; });
    h += PAD - 4;
    return { priority, pColor: PRIORITY_COLORS[priority] || PRIORITY_COLORS.LOW, blocks, h };
  };
  const cards = recs.map(prepareCard);

  sectionHeading(`Recommendations (${recs.length})`, COLORS.brand, cards.length ? cards[0].h : 22);
  if (recs.length === 0) {
    doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(10).text('No recommendations were produced.', MARGIN_X + 12, y, { lineBreak: false });
    y += 22;
  }

  recs.forEach((rec, index) => {
    const { priority, pColor, blocks, h } = cards[index];

    ensure(Math.min(h, limit() - MARGIN_TOP));
    const top = y;
    doc.roundedRect(MARGIN_X, top, contentW, h, 8).fillAndStroke('#FFFFFF', COLORS.line);
    doc.rect(MARGIN_X, top + 6, 4, h - 12).fill(pColor);

    const ix = MARGIN_X + PAD + 4;
    let iy = top + PAD;
    doc.roundedRect(ix, iy, 58, 16, 8).fill(pColor);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
      .text(priority, ix, iy + 4.5, { width: 58, align: 'center', lineBreak: false });
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(9)
      .text(`${index + 1}. ${clean(rec.category) || 'General'}`, ix + 68, iy + 4, { lineBreak: false });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9)
      .text(`Impact: ${clean(rec.estimated_impact) || '-'}   |   Effort: ${clean(rec.effort) || '-'}`, ix, iy + 4, { width: innerW, align: 'right', lineBreak: false });
    iy += 16 + 8;

    blocks.forEach(([label, text]) => {
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7)
        .text(label, ix, iy, { characterSpacing: 0.8, lineBreak: false });
      iy += 10;
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(BODY).text(text || '-', ix, iy, { width: innerW, lineGap: 1.5 });
      iy += bodyHeight(text) + 6;
    });
    y = top + h + 10;
  });

  // ===== About / data note =====
  y += 6;
  const note = usedMocks
    ? 'Data note: this report was generated in demo mode. PageSpeed, Search Console and keyword ranking figures are sample data; the website crawl, on-page, schema and technical checks come from the live site.'
    : 'Data sources: live website crawl, Google PageSpeed Insights, Google Search Console and keyword ranking data, analysed by Claude AI. Each recommendation includes a check you can use to confirm it worked.';
  const noteH = textHeight(note, 'Helvetica-Oblique', 9, contentW);
  ensure(noteH + 8);
  doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(9).text(note, MARGIN_X, y, { width: contentW, lineGap: 2 });

  // ===== Footer on every page =====
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // stops PDFKit adding a page when we draw in the margin
    const fy = doc.page.height - 38;
    doc.moveTo(MARGIN_X, fy - 8).lineTo(W - MARGIN_X, fy - 8).lineWidth(0.5).stroke(COLORS.line);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
      .text(clip(clean(`Edgelink Technology  |  SEO Audit  |  ${client.name}`), 78), MARGIN_X, fy, { width: contentW - 90, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, W - MARGIN_X - 80, fy, { width: 80, align: 'right', lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
  return finished;
}

function reportsDir() {
  return process.env.REPORTS_DIR || path.join(os.tmpdir(), 'reports');
}

/** Renders the report and saves it as <dir>/audit-<id>.pdf. Returns the full path. */
async function generateReportFile(input, dir = reportsDir()) {
  const buffer = await renderReport(input);
  await fs.promises.mkdir(dir, { recursive: true });
  const safeId = String(input.audit.id).replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(dir, `audit-${safeId}.pdf`);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

/** A readable download name such as seo-audit-smile-dental-2026-11-25.pdf */
function reportFileName(client, audit) {
  const slug = clean(client.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client';
  const date = new Date(audit.completedAt || audit.createdAt || Date.now());
  const day = Number.isNaN(date.getTime()) ? 'report' : date.toISOString().slice(0, 10);
  return `seo-audit-${slug}-${day}.pdf`;
}

module.exports = { renderReport, generateReportFile, reportFileName, reportsDir, clean };
