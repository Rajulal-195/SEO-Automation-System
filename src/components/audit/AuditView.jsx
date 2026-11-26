'use client';
// The audit page used by both portals. While an audit is queued or running it
// polls GET /api/audit/:id every 1.5 s, so progress updates live. `variant`
// decides how much detail is shown: "admin" sees the pipeline, delivery log and
// raw JSON; "client" sees only the report.
import { useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  IssueList, PipelineSteps, RecommendationCard, ScoreBar, ScoreRing, StatusBadge,
  formatDateTime, formatDuration, scoreGrade, sortRecommendations,
} from '@/components/audit/widgets';

const POLL_MS = 1500;
const BREAKDOWN = [
  ['technical', 'Technical'],
  ['on_page', 'On-page'],
  ['content', 'Content'],
  ['core_web_vitals', 'Core Web Vitals'],
  ['schema', 'Schema'],
];

export default function AuditView({ initial, variant = 'admin' }) {
  const [audit, setAudit] = useState(initial);
  const [connectionLost, setConnectionLost] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const isAdmin = variant === 'admin';
  const live = audit.status === 'QUEUED' || audit.status === 'RUNNING';

  useEffect(() => {
    if (!live) return undefined;
    let stopped = false;
    let timer;
    let failures = 0;

    const tick = async () => {
      try {
        const res = await fetch(`/api/audit/${audit.id}`, { cache: 'no-store' });
        if (res.status === 401) {
          window.location.assign(isAdmin ? '/login' : '/client');
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next = await res.json();
        if (!stopped) {
          setAudit(next);
          setConnectionLost(false);
          setNow(Date.now());
        }
        failures = 0;
      } catch (_) {
        failures += 1;
        if (!stopped && failures >= 3) setConnectionLost(true);
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };

    timer = setTimeout(tick, POLL_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [audit.id, live, isAdmin]);

  const result = audit.result;
  const failed = audit.status === 'FAILED';
  const waitedMs = now - new Date(audit.createdAt).getTime();
  const duration = audit.completedAt ? formatDuration(audit.createdAt, audit.completedAt) : null;
  const recommendations = sortRecommendations(result && result.recommendations);

  return (
    <div className="space-y-6" data-testid="audit-view" data-status={audit.status}>
      {/* ---------- header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{audit.client?.name || 'SEO audit'}</h1>
            <StatusBadge status={audit.status} />
          </div>
          {audit.client?.websiteUrl && (
            <a href={audit.client.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">{audit.client.websiteUrl}</a>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Started {formatDateTime(audit.createdAt)}
            {audit.completedAt && <> &middot; finished {formatDateTime(audit.completedAt)}{duration && <> ({duration})</>}</>}
            {isAdmin && audit.triggeredBy && <> &middot; triggered by {audit.triggeredBy}</>}
          </p>
        </div>
        {audit.hasPdf && (
          <div className="flex gap-2">
            <a href={`/api/audit/${audit.id}/pdf?inline=1`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'lg' })}>View PDF</a>
            <a href={`/api/audit/${audit.id}/pdf`} className={buttonVariants({ size: 'lg' })} data-testid="download-pdf">Download PDF</a>
          </div>
        )}
      </div>

      {connectionLost && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Connection lost. Retrying automatically...
        </div>
      )}

      {/* ---------- progress ---------- */}
      {(live || failed) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>{failed ? 'Audit failed' : isAdmin ? 'Audit pipeline' : 'Preparing your report'}</span>
              <span className="text-sm font-semibold text-slate-700" data-testid="progress-percent">{audit.progress}%</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={audit.progress} className="h-2.5" data-testid="progress-bar" />
            <p className="text-sm text-slate-700" data-testid="current-step">
              {failed ? 'Stopped.' : audit.currentStep || (audit.status === 'QUEUED' ? 'Waiting in the queue' : 'Starting')}
            </p>
            {isAdmin && <PipelineSteps status={audit.status} progress={audit.progress} />}
            {failed && (
              <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900" data-testid="audit-error">
                {isAdmin ? audit.errorMessage || 'The audit failed.' : 'We could not complete this report. Please contact your account manager.'}
              </div>
            )}
            {audit.status === 'QUEUED' && waitedMs > 20000 && (
              <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700" data-testid="queue-hint">
                {isAdmin
                  ? 'Still waiting for a worker to pick this up. Check that the worker is running (npm run worker locally, or the Railway service).'
                  : 'Your report is queued and will start shortly.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------- results ---------- */}
      {result && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-8 pt-6">
              <div className="flex flex-col items-center gap-2">
                <ScoreRing score={audit.overallScore} />
                <span className="text-sm font-semibold text-slate-700">{scoreGrade(audit.overallScore)}</span>
              </div>
              <div className="min-w-64 flex-1 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">Score breakdown</h2>
                {BREAKDOWN.map(([key, label]) => (
                  <ScoreBar key={key} label={label} value={audit.scoreBreakdown ? audit.scoreBreakdown[key] : 0} />
                ))}
              </div>
            </CardContent>
          </Card>

          {result.executive_summary && (
            <div className="rounded-lg bg-blue-50 px-5 py-4 text-sm leading-relaxed text-slate-800" data-testid="executive-summary">
              <div className="mb-1 text-xs font-bold uppercase tracking-widest text-blue-700">Executive summary</div>
              {result.executive_summary}
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-3">
            <Card><CardContent className="pt-6"><IssueList title="Critical issues" items={result.critical_issues} tone="bad" /></CardContent></Card>
            <Card><CardContent className="pt-6"><IssueList title="Important issues" items={result.important_issues} tone="warn" /></CardContent></Card>
            <Card><CardContent className="pt-6"><IssueList title="Quick wins" items={result.quick_wins} tone="good" /></CardContent></Card>
          </div>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Recommendations ({recommendations.length})</h2>
            <div className="space-y-3">
              {recommendations.map((rec, i) => <RecommendationCard key={i} rec={rec} index={i} />)}
              {recommendations.length === 0 && <p className="text-sm italic text-slate-500">No recommendations were produced.</p>}
            </div>
          </section>
        </>
      )}

      {/* ---------- admin extras ---------- */}
      {isAdmin && audit.status === 'COMPLETED' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Pipeline</CardTitle></CardHeader>
          <CardContent><PipelineSteps status="COMPLETED" progress={100} /></CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-base">Report delivery</CardTitle></CardHeader>
          <CardContent>
            {audit.errorMessage && audit.status === 'COMPLETED' && (
              <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{audit.errorMessage}</p>
            )}
            {(audit.notifications || []).length === 0 ? (
              <p className="text-sm italic text-slate-500" data-testid="no-notifications">
                {audit.status === 'COMPLETED' ? 'No notifications were sent (the client has no WhatsApp number or email on file).' : 'Notifications are sent when the audit completes.'}
              </p>
            ) : (
              <table className="w-full text-sm" data-testid="notifications-table">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="pb-2">Channel</th><th className="pb-2">Status</th><th className="pb-2">Provider ID</th><th className="pb-2">Time</th></tr></thead>
                <tbody>
                  {audit.notifications.map((n) => (
                    <tr key={n.id} className="border-t border-slate-100" data-testid="notification-row">
                      <td className="py-2 capitalize">{n.channel}</td>
                      <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${n.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{n.status}</span></td>
                      <td className="py-2 font-mono text-xs text-slate-600">{n.providerId || '-'}</td>
                      <td className="py-2 text-slate-600">{formatDateTime(n.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && result && (
        <Card>
          <CardHeader><CardTitle className="text-base">Claude JSON output</CardTitle></CardHeader>
          <CardContent>
            <details data-testid="raw-json">
              <summary className="cursor-pointer text-sm font-medium text-blue-700">Show the raw JSON saved in the database</summary>
              <pre className="mt-3 max-h-[480px] overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">{JSON.stringify(result, null, 2)}</pre>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
