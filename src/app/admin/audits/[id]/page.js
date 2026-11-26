import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/pageAuth';
import { shapeAudit } from '@/lib/auditShape';
import AuditView from '@/components/audit/AuditView';

export const dynamic = 'force-dynamic';

export default async function AuditPage({ params }) {
  requireAdmin();

  const audit = await prisma.audit.findUnique({
    where: { id: params.id },
    select: {
      id: true, clientId: true, status: true, progress: true, currentStep: true, triggeredBy: true,
      overallScore: true, scoreBreakdown: true, result: true, errorMessage: true, createdAt: true, completedAt: true,
      client: { select: { id: true, name: true, websiteUrl: true } },
      notifications: { select: { id: true, channel: true, status: true, providerId: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!audit) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/admin/clients/${audit.clientId}`} className="text-sm text-slate-500 hover:underline">&larr; {audit.client.name}</Link>
      <AuditView initial={shapeAudit(audit, 'admin')} variant="admin" />
    </div>
  );
}
