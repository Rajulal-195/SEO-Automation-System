// src/notify/message.js
// Builds the WhatsApp text and the email from a finished audit.
const { scoreGrade } = require('../report/score');

const clip = (text, max) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 3).trimEnd() + '...' : t;
};

const escapeHtml = (value) =>
  String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return String(url || ''); }
}

/** Public link to the PDF. The download route renders it on demand, so it works from any host. */
function reportLink(auditId) {
  const base = (process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  return base ? `${base}/api/audit/${encodeURIComponent(auditId)}/pdf` : null;
}

/** Up to 3 headline problems: critical first, then important, then the summary. */
function topPriorities(result) {
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
  const picked = [...list(result && result.critical_issues), ...list(result && result.important_issues)].slice(0, 3);
  if (picked.length > 0) return picked.map((t) => clip(t, 110));
  const summary = result && typeof result.executive_summary === 'string' ? result.executive_summary : '';
  return summary ? [clip(summary.split(/(?<=[.!?])\s+/)[0], 140)] : [];
}

function buildWhatsAppText({ client, audit }) {
  const score = Math.round(Number(audit.overallScore) || 0);
  const link = reportLink(audit.id);
  const priorities = topPriorities(audit.result);

  const lines = [
    `*SEO audit ready* for ${clip(client.name, 60)}`,
    '',
    `Website: ${clip(client.websiteUrl, 80)}`,
    `Score: ${score}/100 (${scoreGrade(score)})`,
  ];
  if (priorities.length) {
    lines.push('', 'Top priorities:');
    priorities.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  }
  if (link) lines.push('', `Full report (PDF): ${link}`);
  lines.push('', '- Edgelink Technology');
  return lines.join('\n');
}

function buildEmail({ client, audit }) {
  const score = Math.round(Number(audit.overallScore) || 0);
  const grade = scoreGrade(score);
  const link = reportLink(audit.id);
  const priorities = topPriorities(audit.result);
  const summary = audit.result && typeof audit.result.executive_summary === 'string' ? audit.result.executive_summary.trim() : '';
  const subject = `SEO audit report for ${hostOf(client.websiteUrl)}: ${score}/100`;
  const color = score >= 70 ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626';

  const text = [
    `Hello ${client.name},`,
    '',
    `Your SEO audit for ${client.websiteUrl} is ready.`,
    `Overall score: ${score}/100 (${grade})`,
    ...(summary ? ['', summary] : []),
    ...(priorities.length ? ['', 'Top priorities:', ...priorities.map((p, i) => `${i + 1}. ${p}`)] : []),
    ...(link ? ['', `Download the full report (PDF): ${link}`] : []),
    '',
    'Edgelink Technology',
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;">
<div style="background:#0F172A;color:#ffffff;padding:20px 24px;"><div style="font-size:11px;letter-spacing:2px;color:#94A3B8;">EDGELINK TECHNOLOGY</div><div style="font-size:22px;font-weight:bold;margin-top:4px;">SEO Audit Report</div></div>
<div style="padding:24px;">
<p style="margin:0 0 12px;">Hello ${escapeHtml(client.name)},</p>
<p style="margin:0 0 16px;">Your SEO audit for <strong>${escapeHtml(client.websiteUrl)}</strong> is ready.</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:bold;color:${color};">${score}<span style="font-size:14px;color:#6B7280;"> / 100 &middot; ${escapeHtml(grade)}</span></p>
${summary ? `<p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(summary)}</p>` : ''}
${priorities.length ? `<p style="margin:0 0 6px;font-weight:bold;">Top priorities</p><ol style="margin:0 0 16px;padding-left:20px;line-height:1.5;">${priorities.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ol>` : ''}
${link ? `<p style="margin:0 0 8px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;">Download the full report (PDF)</a></p>` : ''}
</div></div></body></html>`;

  return { subject, text, html };
}

module.exports = { buildWhatsAppText, buildEmail, reportLink, topPriorities, escapeHtml };
