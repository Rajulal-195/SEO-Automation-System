// src/pipeline/runAudit.js
// The audit pipeline (PDF section 3.2) for ONE audit:
//   collect signals (steps 1-7) -> Claude analysis -> save to Postgres.
// PDF generation and notifications are added in Chunks 10 and 11.
//
// Used by the BullMQ worker (worker/index.js) and, later, by the cron route.
// The database and the two big steps can be injected, which keeps this
// testable without a live database.

const { UnrecoverableError } = require('bullmq');
const { collectSignals } = require('../crawlers/collect');
const { analyzeSignals } = require('../ai/analyze');

// Progress (0-100) shown in the admin portal
const PROGRESS = {
  started: 2,
  signalsStart: 5, // 7 signal steps move progress from 5 to 47
  signalsStep: 7,
  signalsDone: 55,
  claudeStart: 60,
  saving: 80,
  completed: 100,
};

// Optional pause after each progress update. Leave unset in production; set it to
// about 1500 when recording the demo video so the progress bar is visible
// (with mock data an audit otherwise finishes in well under a second).
const stepDelayMs = () => Number(process.env.PIPELINE_STEP_DELAY_MS) || 0;
const pause = () => {
  const ms = stepDelayMs();
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : undefined;
};

function getDb(deps) {
  // Loaded lazily so importing this file never opens a database connection
  return deps.db || require('../lib/prisma').prisma;
}

/** Makes sure only plain JSON goes into Postgres Json columns. */
const toJson = (value) => JSON.parse(JSON.stringify(value));

async function runAudit(auditId, deps = {}) {
  const db = getDb(deps);
  const collect = deps.collect || collectSignals;
  const analyze = deps.analyze || analyzeSignals;

  const audit = await db.audit.findUnique({ where: { id: auditId }, include: { client: true } });
  if (!audit) {
    // Retrying cannot create a missing row
    throw new UnrecoverableError(`Audit ${auditId} was not found`);
  }
  if (audit.status === 'COMPLETED') {
    console.log(`[audit ${auditId}] already completed, skipping`);
    return { skipped: true };
  }

  const update = async (data) => {
    const row = await db.audit.update({ where: { id: auditId }, data });
    await pause();
    return row;
  };
  const started = Date.now();
  console.log(`[audit ${auditId}] started for ${audit.client.websiteUrl}`);

  await update({
    status: 'RUNNING',
    progress: PROGRESS.started,
    currentStep: 'Starting audit',
    errorMessage: null,
    completedAt: null,
  });

  // Steps 1-7: signal collection, with live progress
  const signals = await collect(audit.client, ({ label, completed }) =>
    update({
      progress: PROGRESS.signalsStart + completed * PROGRESS.signalsStep,
      currentStep: label,
    })
  );
  await update({ progress: PROGRESS.signalsDone, currentStep: 'Signals collected' });

  // Claude analysis (real or mock)
  await update({ progress: PROGRESS.claudeStart, currentStep: 'Analysing with Claude AI' });
  const { result, meta } = await analyze(audit.client, signals);

  // Save to Postgres
  await update({
    progress: PROGRESS.saving,
    currentStep: 'Saving audit results',
    overallScore: result.overall_score,
    scoreBreakdown: toJson(result.score_breakdown),
    signals: toJson({ ...signals, analysisMeta: meta }),
    result: toJson(result),
  });

  await update({
    status: 'COMPLETED',
    progress: PROGRESS.completed,
    currentStep: 'Completed',
    completedAt: new Date(),
  });

  console.log(`[audit ${auditId}] completed in ${Date.now() - started}ms, score ${result.overall_score}`);
  return { skipped: false, score: result.overall_score };
}

/**
 * Records a failed attempt. While BullMQ still has retries left the audit goes
 * back to QUEUED; on the final attempt it becomes FAILED.
 */
async function markFailed(auditId, error, { finalAttempt }, deps = {}) {
  const db = getDb(deps);
  const message = String((error && error.message) || error).slice(0, 1000);
  try {
    await db.audit.update({
      where: { id: auditId },
      data: finalAttempt
        ? { status: 'FAILED', currentStep: 'Failed', errorMessage: message, completedAt: new Date() }
        : { status: 'QUEUED', progress: 0, currentStep: 'Retrying after an error', errorMessage: message },
    });
  } catch (err) {
    console.error(`[audit ${auditId}] could not record failure:`, err.message);
  }
}

/** BullMQ job handler: runs the pipeline and records failures. */
async function processAuditJob(job, deps = {}) {
  const { auditId } = job.data;
  try {
    return await runAudit(auditId, deps);
  } catch (err) {
    const maxAttempts = (job.opts && job.opts.attempts) || 1;
    const finalAttempt =
      err instanceof UnrecoverableError || job.attemptsMade + 1 >= maxAttempts;
    console.error(
      `[audit ${auditId}] attempt ${job.attemptsMade + 1}/${maxAttempts} failed: ${err.message}`
    );
    if (!(err instanceof UnrecoverableError)) {
      await markFailed(auditId, err, { finalAttempt }, deps);
    }
    throw err;
  }
}

module.exports = { runAudit, markFailed, processAuditJob, PROGRESS };
