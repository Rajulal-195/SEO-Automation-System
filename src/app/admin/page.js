import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/pageAuth';
import { toPlain } from '@/lib/auditShape';
import AddClientForm from '@/components/admin/AddClientForm';
import RunAuditButton from '@/components/admin/RunAuditButton';
import CopyLinkButton from '@/components/admin/CopyLinkButton';
import { StatusBadge, formatDate, formatDateTime, scoreColor } from '@/components/audit/widgets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

function Stat({ label, value, testId }) {
  return (
    <Card>
      <CardContent className="pt-4 sm:pt-6">
        <div className="text-2xl font-bold text-slate-900 sm:text-3xl" data-testid={testId}>{value}</div>
        <div className="mt-1 text-sm text-slate-500">{label}</div>
      </CardContent>
    </Card>
  );
}

function LatestAudit({ last }) {
  if (!last) return <span className="text-sm text-slate-400">Never audited</span>;
  return (
    <Link href={`/admin/audits/${last.id}`} className="inline-flex items-center gap-2">
      <StatusBadge status={last.status} />
      {last.overallScore !== null && <span className="text-sm font-bold" style={{ color: scoreColor(last.overallScore) }}>{last.overallScore}</span>}
    </Link>
  );
}

export default async function AdminPage() {
  requireAdmin();

  const [clientRows, auditRows, auditCount] = await Promise.all([
    prisma.client.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        audits: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, progress: true, overallScore: true, createdAt: true, completedAt: true },
        },
      },
    }),
    prisma.audit.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, status: true, overallScore: true, createdAt: true, triggeredBy: true, client: { select: { id: true, name: true } } },
    }),
    prisma.audit.count(),
  ]);
  const clients = toPlain(clientRows);
  const audits = toPlain(auditRows);

  // average of each client's most recent completed score
  const latestScore = new Map();
  for (const a of audits) if (a.status === 'COMPLETED' && a.overallScore !== null && !latestScore.has(a.client.id)) latestScore.set(a.client.id, a.overallScore);
  const scores = [...latestScore.values()];
  const average = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
  const inProgress = audits.filter((a) => a.status === 'QUEUED' || a.status === 'RUNNING').length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500">Clients, audits and delivery at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Clients" value={clients.length} testId="stat-clients" />
        <Stat label="Audits run" value={auditCount} testId="stat-audits" />
        <Stat label="Average score" value={average === null ? '-' : `${average}/100`} testId="stat-average" />
        <Stat label="In progress" value={inProgress} testId="stat-progress" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Clients</CardTitle></CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm italic text-slate-500" data-testid="no-clients">No clients yet. Add the first one below.</p>
          ) : (
            <>
              {/* phones: one card per client, because a 5-column table does not fit */}
              <div className="space-y-3 md:hidden">
                {clients.map((c) => (
                  <div key={c.id} className="rounded-lg border border-slate-200 p-3" data-testid="client-card">
                    <Link href={`/admin/clients/${c.id}`} className="font-semibold text-slate-900 hover:underline">{c.name}</Link>
                    <div className="break-all text-xs text-slate-500">{c.websiteUrl}</div>
                    <div className="text-xs text-slate-400">{c.businessType} &middot; {c.city}, {c.state}</div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                      <LatestAudit last={c.audits[0]} />
                      {c.audits[0] && <span>{formatDate(c.audits[0].createdAt)}</span>}
                    </div>
                    <div className="mt-3 flex flex-wrap items-start gap-2">
                      <RunAuditButton clientId={c.id} />
                      <CopyLinkButton clientId={c.id} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <Table data-testid="clients-table">
                  <TableHeader>
                    <TableRow><TableHead>Client</TableHead><TableHead>Location</TableHead><TableHead>Latest audit</TableHead><TableHead>Last audited</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((c) => {
                      const last = c.audits[0];
                      return (
                        <TableRow key={c.id} data-testid="client-row">
                          <TableCell>
                            <Link href={`/admin/clients/${c.id}`} className="font-semibold text-slate-900 hover:underline">{c.name}</Link>
                            <div className="text-xs text-slate-500">{c.websiteUrl}</div>
                            <div className="text-xs text-slate-400">{c.businessType}</div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{c.city}, {c.state}</TableCell>
                          <TableCell><LatestAudit last={last} /></TableCell>
                          <TableCell className="text-sm text-slate-600">{last ? formatDate(last.createdAt) : '-'}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-start justify-end gap-2">
                              <RunAuditButton clientId={c.id} />
                              <CopyLinkButton clientId={c.id} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent audits</CardTitle></CardHeader>
        <CardContent>
          {audits.length === 0 ? (
            <p className="text-sm italic text-slate-500" data-testid="no-audits">No audits yet. Click &ldquo;Run audit&rdquo; on a client.</p>
          ) : (
            <Table data-testid="recent-audits">
              <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Status</TableHead><TableHead>Score</TableHead><TableHead className="hidden sm:table-cell">Started</TableHead><TableHead className="hidden sm:table-cell">Trigger</TableHead></TableRow></TableHeader>
              <TableBody>
                {audits.slice(0, 8).map((a) => (
                  <TableRow key={a.id} data-testid="audit-row">
                    <TableCell><Link href={`/admin/audits/${a.id}`} className="font-medium text-blue-700 hover:underline">{a.client.name}</Link></TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell className="font-bold" style={{ color: a.overallScore === null ? undefined : scoreColor(a.overallScore) }}>{a.overallScore ?? '-'}</TableCell>
                    <TableCell className="hidden text-sm text-slate-600 sm:table-cell">{formatDateTime(a.createdAt)}</TableCell>
                    <TableCell className="hidden text-sm capitalize text-slate-600 sm:table-cell">{a.triggeredBy}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Add a client</CardTitle></CardHeader>
        <CardContent><AddClientForm /></CardContent>
      </Card>
    </div>
  );
}
