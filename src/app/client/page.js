import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { currentSession } from '@/lib/pageAuth';
import { shapeAudit, toPlain } from '@/lib/auditShape';
import AuditView from '@/components/audit/AuditView';
import { StatusBadge, formatDate, scoreColor } from '@/components/audit/widgets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

function Notice({ title, children, testId }) {
  return (
    <Card className="mx-auto max-w-lg" data-testid={testId}>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="text-sm text-slate-600">{children}</CardContent>
    </Card>
  );
}

export default async function ClientDashboard({ searchParams }) {
  const session = currentSession();

  if (searchParams.error === 'invalid-link') {
    return <Notice title="This link is not valid" testId="invalid-link">The access link is incorrect or has been replaced. Please ask your account manager for a new one.</Notice>;
  }
  if (!session) {
    return <Notice title="Private dashboard" testId="no-session">Open the private link your account manager sent you to see your SEO reports.</Notice>;
  }

  // A client sees only itself. An admin may preview any client with ?client=<id>.
  const clientId = session.role === 'client' ? session.clientId : searchParams.client;
  if (!clientId) {
    return <Notice title="Choose a client" testId="choose-client">Open a client from the admin portal and use &ldquo;Preview client dashboard&rdquo;.</Notice>;
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, websiteUrl: true, businessType: true, city: true, state: true },
  });
  if (!client) return <Notice title="Client not found" testId="client-missing">This dashboard is no longer available.</Notice>;

  const audits = toPlain(
    await prisma.audit.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, overallScore: true, createdAt: true, completedAt: true },
    })
  );

  if (audits.length === 0) {
    return <Notice title={`Welcome, ${client.name}`} testId="no-audits">Your first SEO report is on its way. Check back soon.</Notice>;
  }

  const selected = audits.find((a) => a.id === searchParams.audit) || audits.find((a) => a.status === 'COMPLETED') || audits[0];
  const full = await prisma.audit.findUnique({
    where: { id: selected.id },
    select: {
      id: true, clientId: true, status: true, progress: true, currentStep: true, overallScore: true, scoreBreakdown: true,
      result: true, createdAt: true, completedAt: true,
      client: { select: { id: true, name: true, websiteUrl: true } },
    },
  });

  const preview = session.role === 'admin' ? `&client=${clientId}` : '';
  const trend = audits.filter((a) => a.status === 'COMPLETED' && a.overallScore !== null).slice(0, 8).reverse();

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
      <div>
        {session.role === 'admin' && <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Admin preview of this client&apos;s dashboard.</p>}
        <AuditView key={selected.id} initial={shapeAudit(full, 'client')} variant="client" />
      </div>

      <aside className="space-y-6">
        {trend.length > 1 && (
          <Card data-testid="trend">
            <CardHeader><CardTitle className="text-sm">Score over time</CardTitle></CardHeader>
            <CardContent>
              <div className="flex h-24 items-end gap-1.5">
                {trend.map((a) => (
                  <div key={a.id} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${formatDate(a.createdAt)}: ${a.overallScore}`}>
                    <span className="text-[10px] font-semibold text-slate-600">{a.overallScore}</span>
                    <div className="w-full rounded-t" style={{ height: `${Math.max(6, a.overallScore * 0.7)}px`, backgroundColor: scoreColor(a.overallScore) }} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle className="text-sm">All reports</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2" data-testid="history">
              {audits.map((a) => (
                <li key={a.id}>
                  <Link href={`/client?audit=${a.id}${preview}`} className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-slate-100 ${a.id === selected.id ? 'bg-slate-100 font-semibold' : ''}`}>
                    <span>{formatDate(a.createdAt)}</span>
                    <span className="flex items-center gap-2">
                      {a.overallScore !== null && <span className="font-bold" style={{ color: scoreColor(a.overallScore) }}>{a.overallScore}</span>}
                      {a.status !== 'COMPLETED' && <StatusBadge status={a.status} />}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
