// src/app/api/audit/route.js
// POST /api/audit  { clientId }  ->  202 { auditId }
// Only enqueues. The worker does the heavy work, so this stays well under 10 s.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auditQueue } from '@/lib/queue';
import { withTimeout } from '@/lib/withTimeout';
import { acquireLock, releaseLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

const IN_FLIGHT_WINDOW_MS = 30 * 60 * 1000;
const QUEUE_TIMEOUT_MS = 5000;
const LOCK_TTL_SECONDS = 30;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (_) {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const clientId = body && typeof body.clientId === 'string' ? body.clientId.trim() : '';
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // One request at a time per client, so a double click cannot create two audits
  let lock;
  try {
    lock = await withTimeout(
      acquireLock(`lock:audit:${clientId}`, LOCK_TTL_SECONDS),
      QUEUE_TIMEOUT_MS,
      'Queue is not responding'
    );
  } catch (err) {
    console.error('[POST /api/audit] could not take lock:', err.message);
    return NextResponse.json({ error: 'Could not queue the audit. Please try again.' }, { status: 503 });
  }
  if (!lock) {
    return NextResponse.json(
      { error: 'An audit request for this client is already being processed' },
      { status: 409 }
    );
  }

  try {
    const inFlight = await prisma.audit.findFirst({
      where: {
        clientId,
        status: { in: ['QUEUED', 'RUNNING'] },
        createdAt: { gte: new Date(Date.now() - IN_FLIGHT_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (inFlight) {
      return NextResponse.json(
        { error: 'An audit is already queued or running for this client', auditId: inFlight.id },
        { status: 409 }
      );
    }

    const audit = await prisma.audit.create({ data: { clientId } });

    try {
      await withTimeout(
        auditQueue.add('run-audit', { auditId: audit.id }),
        QUEUE_TIMEOUT_MS,
        'Queue is not responding'
      );
    } catch (err) {
      console.error('[POST /api/audit] could not enqueue:', err.message);
      await prisma.audit
        .update({
          where: { id: audit.id },
          data: { status: 'FAILED', currentStep: 'Failed', errorMessage: 'Could not queue the audit', completedAt: new Date() },
        })
        .catch(() => {});
      return NextResponse.json({ error: 'Could not queue the audit. Please try again.' }, { status: 503 });
    }

    return NextResponse.json({ auditId: audit.id }, { status: 202 });
  } finally {
    await releaseLock(lock).catch(() => {});
  }
}
