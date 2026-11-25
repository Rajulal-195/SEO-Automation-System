// src/pipeline/processBatch.js
// Processes a BOUNDED number of queued jobs from inside an API request.
// Used by the cron route when no separate worker is running (PDF section 6.1).
//
// BullMQ's "manual processing" mode: fetch a job without a running worker loop,
// process it, then mark it completed or failed. Locks make this safe even if a
// real worker is also running, because a job can only be taken by one of them.

const { Worker } = require('bullmq');
const { createRedisConnection } = require('../lib/redis');
const { QUEUE_NAME } = require('../lib/queue');
const { processAuditJob } = require('./runAudit');

async function processQueuedJobs({ maxJobs = 1, budgetMs = 6000, deps = {} } = {}) {
  const started = Date.now();
  const connection = createRedisConnection();
  const worker = new Worker(QUEUE_NAME, null, { connection, autorun: false });
  const processed = [];

  try {
    for (let i = 0; i < maxJobs; i++) {
      // Do not start another audit when the time budget is nearly used up
      if (Date.now() - started > budgetMs) break;

      const token = `cron-${started}-${i}`;
      const job = await worker.getNextJob(token, { block: false });
      if (!job) break; // queue is empty

      try {
        const output = await processAuditJob(job, deps);
        await job.moveToCompleted(output || {}, token, false);
        processed.push({ jobId: job.id, auditId: job.data.auditId, ok: true });
      } catch (err) {
        await job.moveToFailed(err, token, false); // BullMQ decides: retry or final failure
        processed.push({ jobId: job.id, auditId: job.data.auditId, ok: false, error: err.message });
      }
    }
  } finally {
    await worker.close().catch(() => {});
    await connection.quit().catch(() => {});
  }

  return processed;
}

module.exports = { processQueuedJobs };
