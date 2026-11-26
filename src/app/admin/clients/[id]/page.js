import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/pageAuth';
import { toPlain } from '@/lib/auditShape';
import RunAuditButton from '@/components/admin/RunAuditButton';
import CopyLinkButton from '@/components/admin/CopyLinkButton';
import { StatusBadge, formatDateTime, scoreColor } from '@/components/audit/widgets';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

export default async function ClientPage({ params }) {
  requireAdmin();

  const row = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      audits: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, overallScore: true, createdAt: true, completedAt: true, triggeredBy: true },
      },
    },
  });
  if (!row) notFound();
  const client = toPlain(row);

  const info = [
    ['Website', client.websiteUrl], ['Business type', client.businessType], ['Location', `${client.city}, ${client.state}`],
    ['WhatsApp', client.whatsapp || 'Not set'], ['Email', client.email || 'Not set'],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-slate-500 hover:underline">&larr; Overview</Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900" data-testid="client-name">{client.name}</h1>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <RunAuditButton clientId={client.id} size="lg" label="Run new audit" />
          <CopyLinkButton clientId={client.id} />
          <Link href={`/client?client=${client.id}`} target="_blank" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Preview client dashboard</Link>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          {info.map(([label, value]) => (
            <div key={label}><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-0.5 text-sm text-slate-900">{value}</div></div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Audit history ({client.audits.length})</CardTitle></CardHeader>
        <CardContent>
          {client.audits.length === 0 ? (
            <p className="text-sm italic text-slate-500" data-testid="no-audits">This client has not been audited yet.</p>
          ) : (
            <Table data-testid="client-audits">
              <TableHeader><TableRow><TableHead>Started</TableHead><TableHead>Status</TableHead><TableHead>Score</TableHead><TableHead className="hidden sm:table-cell">Trigger</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {client.audits.map((a) => (
                  <TableRow key={a.id} data-testid="audit-row">
                    <TableCell className="text-sm">{formatDateTime(a.createdAt)}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell className="font-bold" style={{ color: a.overallScore === null ? undefined : scoreColor(a.overallScore) }}>{a.overallScore ?? '-'}</TableCell>
                    <TableCell className="hidden text-sm capitalize text-slate-600 sm:table-cell">{a.triggeredBy}</TableCell>
                    <TableCell className="text-right"><Link href={`/admin/audits/${a.id}`} className="text-sm font-medium text-blue-700 hover:underline">Open</Link></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
