// src/lib/lock.js
// Small Redis lock (SET NX EX) used to make "check then create" steps atomic,
// because the database schema has no unique constraint to do it for us.
//   - POST /api/audit: one request at a time per client (double clicks)
//   - cron route: one scheduler run at a time (overlapping cron calls)
// The lock always expires by itself, so a crashed request can never block forever.
const crypto = require('crypto');
const { getQueueConnection } = require('./queue');

// Release only if we still own the lock (it may have expired and been taken by someone else)
const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/** Returns { key, token } when acquired, or null when somebody else holds the lock. */
async function acquireLock(key, ttlSeconds) {
  const redis = getQueueConnection();
  const token = crypto.randomUUID();
  const reply = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
  return reply === 'OK' ? { key, token } : null;
}

async function releaseLock(lock) {
  if (!lock) return;
  const redis = getQueueConnection();
  await redis.eval(RELEASE_SCRIPT, 1, lock.key, lock.token);
}

module.exports = { acquireLock, releaseLock };
