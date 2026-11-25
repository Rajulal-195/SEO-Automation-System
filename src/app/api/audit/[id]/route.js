// src/app/api/audit/[id]/route.js
// GET /api/audit/:id  ->  status, progress, currentStep, overallScore, result
// Polled by the admin portal while an audit runs, so it only reads one row.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const audit = await prisma.audit.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      clientId: true,
      status: true,
      progress: true,
      currentStep: true,
      triggeredBy: true,
      overallScore: true,
      scoreBreakdown: true,
      result: true,
      errorMessage: true,
      createdAt: true,
      completedAt: true,
      client: { select: { id: true, name: true, websiteUrl: true } },
    },
  });

  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  // The report is rendered on demand from the saved result, so it is downloadable
  // as soon as the audit is complete. The server-side file path is never exposed.
  const hasPdf = audit.status === 'COMPLETED' && audit.result !== null;
  return NextResponse.json({ ...audit, hasPdf }, { headers: { 'Cache-Control': 'no-store' } });
}
