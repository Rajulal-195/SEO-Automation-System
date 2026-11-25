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
      pdfPath: true,
      errorMessage: true,
      createdAt: true,
      completedAt: true,
      client: { select: { id: true, name: true, websiteUrl: true } },
    },
  });

  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  // The raw server path stays private; the UI only needs to know a PDF exists
  const { pdfPath, ...rest } = audit;
  return NextResponse.json({ ...rest, hasPdf: Boolean(pdfPath) }, { headers: { 'Cache-Control': 'no-store' } });
}
