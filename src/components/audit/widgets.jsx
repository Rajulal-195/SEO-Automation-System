// Small presentational pieces shared by the admin portal and the client dashboard.
import { Badge } from '@/components/ui/badge';

const TIME_ZONE = 'Asia/Kolkata'; // fixed zone, so server and browser render identical text

export function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TIME_ZONE,
  }).format(d);
}

export function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE }).format(d);
}

export function formatDuration(from, to) {
  const ms = new Date(to) - new Date(from);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function scoreColor(score) {
  if (score >= 70) return '#16A34A';
  if (score >= 50) return '#D97706';
  return '#DC2626';
}

export function scoreGrade(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Needs improvement';
  return 'Poor';
}

export function ScoreRing({ score, size = 148 }) {
  const value = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const color = scoreColor(value);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Overall score ${value} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold leading-none" style={{ color }} data-testid="overall-score">{value}</span>
        <span className="mt-1 text-xs text-slate-500">out of 100</span>
      </div>
    </div>
  );
}

export function ScoreBar({ label, value }) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 shrink-0 text-slate-700">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full" style={{ width: `${v}%`, backgroundColor: scoreColor(v) }} />
      </div>
      <span className="w-8 text-right font-semibold text-slate-900">{v}</span>
    </div>
  );
}

const STATUS_STYLES = {
  QUEUED: 'bg-slate-100 text-slate-700',
  RUNNING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
};
const STATUS_LABELS = { QUEUED: 'Queued', RUNNING: 'Running', COMPLETED: 'Completed', FAILED: 'Failed' };

export function StatusBadge({ status }) {
  return (
    <Badge className={`${STATUS_STYLES[status] || STATUS_STYLES.QUEUED} border-0`} data-testid="status-badge">
      {status === 'RUNNING' && <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-blue-600" />}
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

const PRIORITY_STYLES = {
  CRITICAL: { bg: '#DC2626', label: 'Critical' },
  HIGH: { bg: '#EA580C', label: 'High' },
  MEDIUM: { bg: '#CA8A04', label: 'Medium' },
  LOW: { bg: '#64748B', label: 'Low' },
};
const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function sortRecommendations(list) {
  const rank = (p) => { const i = PRIORITY_ORDER.indexOf(String(p).toUpperCase()); return i === -1 ? PRIORITY_ORDER.length : i; };
  return (Array.isArray(list) ? list : [])
    .map((rec, index) => ({ rec, index }))
    .sort((a, b) => rank(a.rec.priority) - rank(b.rec.priority) || a.index - b.index)
    .map((x) => x.rec);
}

export function PriorityBadge({ priority }) {
  const p = PRIORITY_STYLES[String(priority).toUpperCase()] || PRIORITY_STYLES.LOW;
  return <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: p.bg }}>{p.label}</span>;
}

export function RecommendationCard({ rec, index }) {
  const color = (PRIORITY_STYLES[String(rec.priority).toUpperCase()] || PRIORITY_STYLES.LOW).bg;
  const block = (label, text) => (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
      <p className="mt-0.5 text-sm leading-relaxed text-slate-800">{text || '-'}</p>
    </div>
  );
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" style={{ borderLeft: `4px solid ${color}` }} data-testid="recommendation">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={rec.priority} />
        <span className="text-xs font-semibold text-slate-600">{index + 1}. {rec.category}</span>
        <span className="ml-auto text-xs text-slate-500">Impact: {rec.estimated_impact} &nbsp;|&nbsp; Effort: {rec.effort}</span>
      </div>
      <div className="space-y-3">
        {block('Finding', rec.finding)}
        {block('Fix', rec.fix)}
        {block('How we will know it worked', rec.falsifiability_check)}
      </div>
    </div>
  );
}

export function IssueList({ title, items, tone }) {
  const dot = { bad: 'bg-red-500', warn: 'bg-amber-500', good: 'bg-emerald-500' }[tone] || 'bg-slate-400';
  const list = Array.isArray(items) ? items : [];
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title} <span className="font-normal text-slate-500">({list.length})</span></h3>
      {list.length === 0 ? (
        <p className="text-sm italic text-slate-500">None identified.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-slate-800">
              <span className={`mt-1.5 size-1.5 shrink-0 rounded-sm ${dot}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The pipeline stages, in the order the worker runs them. `at` is the progress
// value at which the worker starts the stage (see PROGRESS in src/pipeline/runAudit.js).
export const PIPELINE = [
  { label: 'Crawl website', at: 5 },
  { label: 'PageSpeed Insights', at: 12 },
  { label: 'Search Console', at: 19 },
  { label: 'Schema.org validation', at: 26 },
  { label: 'On-page analysis', at: 33 },
  { label: 'robots.txt and sitemap', at: 40 },
  { label: 'Keyword rankings', at: 47 },
  { label: 'Claude AI analysis', at: 55 },
  { label: 'Save to database', at: 80 },
  { label: 'Generate PDF report', at: 85 },
  { label: 'Send notifications', at: 95 },
];

export function pipelineState(status, progress) {
  return PIPELINE.map((step, i) => {
    const next = PIPELINE[i + 1] ? PIPELINE[i + 1].at : 100;
    if (status === 'COMPLETED') return 'done';
    if (progress >= next) return 'done';
    if (progress >= step.at) return status === 'FAILED' ? 'failed' : 'active';
    return 'pending';
  });
}

export function PipelineSteps({ status, progress }) {
  const states = pipelineState(status, progress);
  return (
    <ol className="grid gap-x-6 gap-y-1.5 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-6" data-testid="pipeline-steps">
      {PIPELINE.map((step, i) => {
        const s = states[i];
        return (
          <li key={step.label} className="flex items-center gap-2 text-sm" data-state={s}>
            <span className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${
              s === 'done' ? 'bg-emerald-500 text-white' : s === 'active' ? 'animate-pulse bg-blue-500 text-white' : s === 'failed' ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              {s === 'done' ? '\u2713' : s === 'failed' ? '!' : i + 1}
            </span>
            <span className={s === 'pending' ? 'text-slate-400' : s === 'active' ? 'font-semibold text-slate-900' : 'text-slate-700'}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
