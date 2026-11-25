// src/lib/cronAuth.js
// Checks the secret that cron-job.org sends with every request to the cron route.
const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

/**
 * Accepts the secret in either header:
 *   x-cron-secret: <CRON_SECRET>
 *   Authorization: Bearer <CRON_SECRET>
 * Returns { ok: true } or { ok: false, status, error }.
 */
function checkCronSecret(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Never leave the endpoint open when the secret is missing
    return { ok: false, status: 503, error: 'CRON_SECRET is not configured on the server' };
  }

  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const provided = request.headers.get('x-cron-secret') || bearer;
  if (!provided) return { ok: false, status: 401, error: 'Missing cron secret header' };

  // Compare hashes so the check takes the same time whatever the input length
  if (!crypto.timingSafeEqual(sha256(provided), sha256(expected))) {
    return { ok: false, status: 401, error: 'Invalid cron secret' };
  }
  return { ok: true };
}

module.exports = { checkCronSecret };
