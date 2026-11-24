// worker/index.js
// Long-running BullMQ worker. Start it with:  npm run worker
// Host it on Railway (or any host that can run a Node process); NOT on Vercel.

// dotenv MUST come first: src/mocks reads USE_MOCKS once, when it is loaded.
require('dotenv').config();

const { Worker } = require('bullmq');
const { createRedisConnection } = require('../src/lib/redis');
const { QUEUE_NAME } = require('../src/lib/queue');
const { processAuditJob } = require('../src/pipeline/runAudit');

/**
 * Builds the worker. `deps` lets tests inject a fake database and connection.
 * Polling settings are deliberately relaxed so an idle worker uses few Upstash
 * commands (free tier: 500K per month).
 */
function createAuditWorker(deps = {}) {
  const connection = deps.connection || createRedisConnection();

  const worker = new Worker(QUEUE_NAME, (job) => processAuditJob(job, deps), {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY) || 1,
    drainDelay: Number(process.env.WORKER_DRAIN_DELAY) || 60, // seconds to wait when the queue is empty
    stalledInterval: 120000, // check for stalled jobs every 2 minutes
    lockDuration: 60000,
  });

  worker.on('ready', () => console.log(`[worker] ready, listening on queue "${QUEUE_NAME}"`));
  worker.on('active', (job) => console.log(`[worker] job ${job.id} started (audit ${job.data.auditId})`));
  worker.on('completed', (job) => console.log(`[worker] job ${job.id} completed`));
  worker.on('failed', (job, err) =>
    console.error(`[worker] job ${job && job.id} failed: ${err.message}`)
  );
  worker.on('error', (err) => console.error('[worker] error:', err.message));

  async function close() {
    await worker.close();
    await connection.quit().catch(() => {});
  }

  return { worker, close };
}

function start() {
  const mode = process.env.USE_MOCKS === 'true' ? 'MOCK data' : 'LIVE APIs';
  console.log(`[worker] starting (${mode})`);

  const { close } = createAuditWorker();

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received, finishing the current job and shutting down`);
    try {
      await close();
      await require('../src/lib/prisma').prisma.$disconnect();
    } catch (err) {
      console.error('[worker] error during shutdown:', err.message);
    }
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) start();

module.exports = { createAuditWorker };
