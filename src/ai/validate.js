// src/ai/validate.js
// Parses and checks Claude's reply against the JSON structure in the assessment
// (section 6.2).
//   - Structural problems (bad JSON, missing fields, bad enums) => ok: false,
//     so the caller can ask Claude again.
//   - Limit overflows (too many issues, scores out of range, summary too long)
//     are fixed automatically and listed in `notes`.

const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const CATEGORIES = ['Technical', 'OnPage', 'Content', 'Schema', 'CWV'];
const IMPACTS = ['High', 'Medium', 'Low'];
const EFFORTS = ['Hours', 'Days', 'Weeks'];
const SCORE_KEYS = ['technical', 'on_page', 'content', 'core_web_vitals', 'schema'];

const LIMITS = { critical_issues: 5, important_issues: 8, quick_wins: 5 };
const MAX_SUMMARY_SENTENCES = 3;

const ALIASES = {
  category: {
    technical: 'Technical', onpage: 'OnPage', 'on-page': 'OnPage', 'on page': 'OnPage',
    content: 'Content', schema: 'Schema', 'schema.org': 'Schema',
    cwv: 'CWV', 'core web vitals': 'CWV', corewebvitals: 'CWV', performance: 'CWV',
  },
  effort: { hour: 'Hours', day: 'Days', week: 'Weeks' },
};

function normalizeEnum(value, allowed, aliases = {}) {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  const direct = allowed.find((a) => a.toLowerCase() === key);
  return direct || aliases[key] || null;
}

/** Pulls a JSON object out of the reply, tolerating code fences or stray text. */
function extractJson(text) {
  let body = String(text || '').trim();
  body = body.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(body);
  } catch (firstError) {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(body.slice(start, end + 1));
    }
    throw firstError;
  }
}

function toScore(value, label, problems, notes) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    problems.push(`${label} must be a number from 0 to 100`);
    return null;
  }
  const fixed = Math.min(100, Math.max(0, Math.round(n)));
  if (fixed !== n) notes.push(`${label} adjusted from ${n} to ${fixed}`);
  return fixed;
}

function toIssueText(item) {
  if (typeof item === 'string') return item.trim();
  if (item && typeof item === 'object') {
    const text = item.finding || item.issue || item.title || item.description;
    if (typeof text === 'string') return text.trim();
    return JSON.stringify(item);
  }
  return String(item);
}

function limitIssues(value, key, problems, notes) {
  if (!Array.isArray(value)) {
    problems.push(`${key} must be an array`);
    return [];
  }
  const items = value.map(toIssueText).filter(Boolean);
  const max = LIMITS[key];
  if (items.length > max) {
    notes.push(`${key} trimmed from ${items.length} to ${max}`);
    return items.slice(0, max);
  }
  return items;
}

function limitSummary(value, problems, notes) {
  if (typeof value !== 'string' || !value.trim()) {
    problems.push('executive_summary must be a non-empty string');
    return '';
  }
  const sentences = value.trim().split(/(?<=[.!?])\s+/);
  if (sentences.length > MAX_SUMMARY_SENTENCES) {
    notes.push(`executive_summary trimmed from ${sentences.length} to ${MAX_SUMMARY_SENTENCES} sentences`);
    return sentences.slice(0, MAX_SUMMARY_SENTENCES).join(' ');
  }
  return value.trim();
}

function checkRecommendation(rec, index, problems) {
  const label = `recommendations[${index}]`;
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
    problems.push(`${label} must be an object`);
    return null;
  }

  const priority = normalizeEnum(rec.priority, PRIORITIES);
  const category = normalizeEnum(rec.category, CATEGORIES, ALIASES.category);
  const impact = normalizeEnum(rec.estimated_impact, IMPACTS);
  const effort = normalizeEnum(rec.effort, EFFORTS, ALIASES.effort);

  if (!priority) problems.push(`${label}.priority must be one of ${PRIORITIES.join('|')}`);
  if (!category) problems.push(`${label}.category must be one of ${CATEGORIES.join('|')}`);
  if (!impact) problems.push(`${label}.estimated_impact must be one of ${IMPACTS.join('|')}`);
  if (!effort) problems.push(`${label}.effort must be one of ${EFFORTS.join('|')}`);

  for (const field of ['finding', 'fix', 'falsifiability_check']) {
    if (typeof rec[field] !== 'string' || !rec[field].trim()) {
      problems.push(`${label}.${field} must be a non-empty string`);
    }
  }

  return {
    priority,
    category,
    finding: typeof rec.finding === 'string' ? rec.finding.trim() : '',
    fix: typeof rec.fix === 'string' ? rec.fix.trim() : '',
    estimated_impact: impact,
    effort,
    falsifiability_check: typeof rec.falsifiability_check === 'string' ? rec.falsifiability_check.trim() : '',
  };
}

/**
 * @param {string} rawText Claude's reply text
 * @returns {{ ok: boolean, data: object|null, problems: string[], notes: string[] }}
 */
function validateAnalysis(rawText) {
  const problems = [];
  const notes = [];

  let parsed;
  try {
    parsed = extractJson(rawText);
  } catch (err) {
    return { ok: false, data: null, problems: [`Reply is not valid JSON: ${err.message}`], notes };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, data: null, problems: ['Reply must be a JSON object'], notes };
  }

  const overall = toScore(parsed.overall_score, 'overall_score', problems, notes);

  const breakdown = {};
  if (!parsed.score_breakdown || typeof parsed.score_breakdown !== 'object') {
    problems.push('score_breakdown must be an object');
  } else {
    for (const key of SCORE_KEYS) {
      breakdown[key] = toScore(parsed.score_breakdown[key], `score_breakdown.${key}`, problems, notes);
    }
  }

  const critical = limitIssues(parsed.critical_issues, 'critical_issues', problems, notes);
  const important = limitIssues(parsed.important_issues, 'important_issues', problems, notes);
  const quickWins = limitIssues(parsed.quick_wins, 'quick_wins', problems, notes);

  let recommendations = [];
  if (!Array.isArray(parsed.recommendations)) {
    problems.push('recommendations must be an array');
  } else {
    recommendations = parsed.recommendations
      .map((rec, i) => checkRecommendation(rec, i, problems))
      .filter(Boolean);
    if (recommendations.length === 0) notes.push('recommendations is empty');
  }

  const summary = limitSummary(parsed.executive_summary, problems, notes);

  if (problems.length > 0) return { ok: false, data: null, problems, notes };

  return {
    ok: true,
    problems: [],
    notes,
    data: {
      audit_version: typeof parsed.audit_version === 'string' ? parsed.audit_version : 'v1.0',
      overall_score: overall,
      score_breakdown: breakdown,
      critical_issues: critical,
      important_issues: important,
      quick_wins: quickWins,
      recommendations,
      executive_summary: summary,
    },
  };
}

module.exports = { validateAnalysis, extractJson, LIMITS };
