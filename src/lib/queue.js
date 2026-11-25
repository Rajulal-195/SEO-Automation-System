// src/lib/queue.js
const { Queue } = require('bullmq');
const { createRedisConnection } = require('./redis');

const QUEUE_NAME = 'seo-audit-jobs';
const JOB_NAME = 'run-audit';

const globalForQueue = globalThis;

/**
 * Returns the single audit Queue for this process.
 * It is created on first use, NOT at import time, so `next build` on Vercel
 * does not try to connect to Redis.
 */
function getAuditQueue() {
  if (!globalForQueue.__auditQueue) {
    const connection = createRedisConnection();

    globalForQueue.__auditQueueConnection = connection;
    globalForQueue.__auditQueue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        // Keep Redis small (Upstash free tier is 256MB / 500K commands per month)
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return globalForQueue.__auditQueue;
}

/** The Redis connection behind the queue (created on first use). Used by lock.js. */
function getQueueConnection() {
  getAuditQueue();
  return globalForQueue.__auditQueueConnection;
}

/**
 * Lets routes use `auditQueue.add(...)` exactly as written in the assessment,
 * while the real Queue is only created when a method is first called.
 */
const auditQueue = new Proxy(
  {},
  {
    get(_target, prop) {
      const queue = getAuditQueue();
      const value = queue[prop];
      return typeof value === 'function' ? value.bind(queue) : value;
    },
  }
);

/**
 * Closes the queue AND its Redis connection (BullMQ does not close a
 * connection you pass in). Used by scripts and the worker's shutdown.
 */
async function closeAuditQueue() {
  const queue = globalForQueue.__auditQueue;
  const connection = globalForQueue.__auditQueueConnection;
  globalForQueue.__auditQueue = undefined;
  globalForQueue.__auditQueueConnection = undefined;

  if (queue) await queue.close();
  if (connection) await connection.quit();
}

module.exports = { auditQueue, getAuditQueue, getQueueConnection, closeAuditQueue, QUEUE_NAME, JOB_NAME };
