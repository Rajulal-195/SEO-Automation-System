// src/app/api/audit/[id]/route.js
// GET /api/audit/:id  ->  status, progress, currentStep, overallScore, result
// Polled by both portals while an audit runs, so it only reads one row.
// Admins get everything; a client gets only the report of its own audits.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestSession, canAccessClient } from '@/lib/auth';
import { shapeAudit } from '@/lib/auditShape';

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
      notifications: {
        select: { id: true, channel: true, status: true, providerId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  // A client asking for someone else's audit gets "not found", not "forbidden"
  if (!audit || !canAccessClient(session, audit.clientId)) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }

  return NextResponse.json(shapeAudit(audit, session.role), { headers: { 'Cache-Control': 'no-store' } });
}
