// src/pipeline/schedule.js
// "Monthly audits that are due" logic for the cron route.
//
// A client is due when:
//   - it has never been audited, or
//   - its latest audit is 30 or more days old, or
//   - its latest audit FAILED and is at least 24 hours old (retry the next day).
// A client with a fresh QUEUED or RUNNING audit (under 24 hours old) is skipped.

const { JOB_NAME } = require('../lib/queue');
const { withTimeout } = require('../lib/withTimeout');

const QUEUE_TIMEOUT_MS = 5000;

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_AFTER_MS = 30 * DAY_MS;
const FAILED_RETRY_AFTER_MS = DAY_MS;
const IN_FLIGHT_STALE_AFTER_MS = DAY_MS;

function isDue(latestAudit, now) {
  if (!latestAudit) return true;

  const age = now.getTime() - new Date(latestAudit.createdAt).getTime();
  const inFlight = latestAudit.status === 'QUEUED' || latestAudit.status === 'RUNNING';

  if (inFlight && age < IN_FLIGHT_STALE_AFTER_MS) return false;
  if (latestAudit.status === 'FAILED') return age >= FAILED_RETRY_AFTER_MS;
  return age >= DUE_AFTER_MS;
}

/**
 * Creates a 'cron' audit and queue job for every due client (at most `limit`).
 * One client failing never stops the others.
 */
async function enqueueDueAudits({ db, queue, now = new Date(), limit = 10 }) {
  const clients = await db.client.findMany({
    select: {
      id: true,
      name: true,
      audits: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, createdAt: true } },
    },
  });

  const due = clients.filter((c) => isDue(c.audits[0], now));
  const batch = due.slice(0, limit);

  const enqueued = [];
  const errors = [];

  let queueDown = false;

  for (const client of batch) {
    let audit;
    try {
      audit = await db.audit.create({ data: { clientId: client.id, triggeredBy: 'cron' } });
    } catch (err) {
      errors.push({ clientId: client.id, message: err.message });
      continue;
    }

    try {
      await withTimeout(queue.add(JOB_NAME, { auditId: audit.id }), QUEUE_TIMEOUT_MS, 'Queue is not responding');
      enqueued.push({ clientId: client.id, clientName: client.name, auditId: audit.id });
    } catch (err) {
      errors.push({ clientId: client.id, message: err.message });
      await db.audit
        .update({
          where: { id: audit.id },
          data: { status: 'FAILED', currentStep: 'Failed', errorMessage: 'Could not queue the audit', completedAt: new Date() },
        })
        .catch(() => {});
      // Redis is probably unreachable: stop here instead of waiting for every remaining client
      queueDown = true;
      break;
    }
  }

  return {
    totalClients: clients.length,
    due: due.length,
    enqueued,
    deferred: due.length - enqueued.length - errors.length, // due but not queued this run; a later run picks them up
    queueDown,
    errors,
  };
}

module.exports = { enqueueDueAudits, isDue };
