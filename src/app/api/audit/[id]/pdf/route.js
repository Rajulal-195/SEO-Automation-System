// src/app/api/audit/[id]/pdf/route.js
// GET /api/audit/:id/pdf            -> downloads the PDF report
// GET /api/audit/:id/pdf?inline=1   -> shows it in the browser tab
//
// Admins and the owning client only. The report is rendered from the audit saved in Postgres, with the same code
// the worker uses, so it works even though the worker (Railway) and this app
// (Vercel) are on different machines and share no files.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { renderReport, reportFileName } from '@/report/pdf';
import { getRequestSession, canAccessClient } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const session = getRequestSession(req);
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const audit = await prisma.audit.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      clientId: true,
      status: true,
      overallScore: true,
      scoreBreakdown: true,
      signals: true,
      result: true,
      createdAt: true,
      completedAt: true,
      client: { select: { name: true, websiteUrl: true, businessType: true, city: true, state: true } },
    },
  });

  if (!audit || !canAccessClient(session, audit.clientId)) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }
  if (audit.status !== 'COMPLETED' || !audit.result) {
    return NextResponse.json({ error: 'The report is not ready yet' }, { status: 409 });
  }

  try {
    const { client, ...auditData } = audit;
    const pdf = await renderReport({ client, audit: auditData });
    const inline = new URL(req.url).searchParams.get('inline') === '1';
    const fileName = reportFileName(client, audit);

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[GET /api/audit/:id/pdf] render failed:', err.message);
    return NextResponse.json({ error: 'Could not generate the report' }, { status: 500 });
  }
}
