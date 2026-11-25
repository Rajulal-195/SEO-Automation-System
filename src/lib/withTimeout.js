// src/lib/withTimeout.js
// Rejects if a promise takes longer than `ms`.
// Needed because ioredis waits forever for an unreachable Redis, and Vercel
// routes must answer within 10 seconds.
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || `Timed out after ${ms}ms`)), ms);
  });
  // Promise.race also handles a later rejection of the original promise,
  // so an abandoned call can never become an unhandled rejection.
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { withTimeout };
