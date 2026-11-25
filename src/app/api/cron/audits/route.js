// src/app/api/cron/audits/route.js
// GET /api/cron/audits  - called by cron-job.org every minute.
//   1. Checks the CRON_SECRET header.
//   2. Enqueues monthly audits that are due (one scheduler run at a time).
//   3. Only if CRON_PROCESS_JOBS=true (no separate worker): processes a small,
//      time-bounded batch of queued jobs.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auditQueue } from '@/lib/queue';
import { checkCronSecret } from '@/lib/cronAuth';
import { withTimeout } from '@/lib/withTimeout';
import { acquireLock, releaseLock } from '@/lib/lock';
import { enqueueDueAudits } from '@/pipeline/schedule';
import { processQueuedJobs } from '@/pipeline/processBatch';

export const dynamic = 'force-dynamic';

const SCHEDULER_LOCK_TTL_SECONDS = 55;

export async function GET(req) {
  const auth = checkCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const startedAt = Date.now();
  const summary = { ok: true };

  // Overlapping cron calls must not both schedule the same clients
  let lock = null;
  try {
    lock = await withTimeout(
      acquireLock('lock:cron:schedule', SCHEDULER_LOCK_TTL_SECONDS),
      5000,
      'Queue is not responding'
    );
  } catch (err) {
    console.error('[cron] could not take scheduler lock:', err.message);
    return NextResponse.json({ ok: false, error: 'Scheduling failed: ' + err.message }, { status: 500 });
  }

  if (!lock) {
    summary.scheduling = { skipped: 'another cron run is already scheduling audits' };
  } else {
    try {
      summary.scheduling = await enqueueDueAudits({ db: prisma, queue: auditQueue });
      // Report problems with a non-200 status so cron-job.org flags the run as failed
      if (summary.scheduling.errors.length > 0) summary.ok = false;
    } catch (err) {
      console.error('[cron] scheduling failed:', err.message);
      return NextResponse.json({ ok: false, error: 'Scheduling failed: ' + err.message }, { status: 500 });
    } finally {
      await releaseLock(lock).catch(() => {});
    }
  }

  if (process.env.CRON_PROCESS_JOBS === 'true') {
    try {
      summary.processed = await withTimeout(
        processQueuedJobs({ maxJobs: Number(process.env.CRON_MAX_JOBS) || 1, budgetMs: 6000 }),
        9000,
        'Job processing exceeded the time budget'
      );
    } catch (err) {
      console.error('[cron] processing failed:', err.message);
      summary.ok = false;
      summary.processingError = err.message;
    }
  } else {
    summary.processed = 'skipped (CRON_PROCESS_JOBS is not true: a separate worker handles the queue)';
  }

  try {
    summary.queue = await withTimeout(
      auditQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      2000,
      'Queue counts timed out'
    );
  } catch (_) { /* counts are informational only */ }

  summary.elapsedMs = Date.now() - startedAt;
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
