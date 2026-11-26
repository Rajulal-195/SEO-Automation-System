// src/lib/auth.js
// Sessions for the two portals, with no extra database tables.
//   - Admin:  logs in with ADMIN_USERNAME / ADMIN_PASSWORD (from the environment).
//   - Client: opens a signed access link that the admin copies from the portal.
// A session is an HMAC-signed value in an HttpOnly cookie. Rotating AUTH_SECRET
// signs everybody out and revokes every client link.
const crypto = require('crypto');

const ADMIN_COOKIE = 'edgelink_admin';
const CLIENT_COOKIE = 'edgelink_client';
const ADMIN_TTL_SECONDS = 8 * 60 * 60;
const CLIENT_TTL_SECONDS = 30 * 24 * 60 * 60;
const VERSION = 'v1';

function getSecret() {
  const secret = process.env.AUTH_SECRET || process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET is not set (use a random string of at least 16 characters)');
  }
  return secret;
}

const b64 = (buffer) => Buffer.from(buffer).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', getSecret()).update(data).digest();

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Compares secrets without leaking their length or content through timing. */
function safeEqualText(a, b) {
  const hash = (v) => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

function signToken(payload) {
  const body = `${VERSION}.${b64(JSON.stringify(payload))}`;
  return `${body}.${b64(hmac(body))}`;
}

/** Returns the payload, or null when the token is forged, malformed or expired. */
function verifyToken(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || parts[0] !== VERSION) return null;
    const body = `${parts[0]}.${parts[1]}`;
    if (!safeEqual(b64(hmac(body)), parts[2])) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

const createAdminToken = (username) =>
  signToken({ r: 'admin', u: String(username), exp: nowSeconds() + ADMIN_TTL_SECONDS });

const createClientToken = (clientId) =>
  signToken({ r: 'client', c: String(clientId), exp: nowSeconds() + CLIENT_TTL_SECONDS });

/** Resolves the session from the two cookie values. Admin wins when both are present. */
function sessionFromCookies({ admin, client } = {}) {
  try {
    const a = verifyToken(admin);
    if (a && a.r === 'admin') return { role: 'admin', username: a.u };
    const c = verifyToken(client);
    if (c && c.r === 'client' && c.c) return { role: 'client', clientId: c.c };
  } catch (_) { /* missing secret: nobody is signed in */ }
  return null;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const name = part.slice(0, i).trim();
    if (name && !(name in out)) out[name] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Session for a route handler (reads the Cookie header). */
function getRequestSession(request) {
  const jar = parseCookies(request.headers.get('cookie'));
  return sessionFromCookies({ admin: jar[ADMIN_COOKIE], client: jar[CLIENT_COOKIE] });
}

/** Admins may see everything; a client only its own records. */
function canAccessClient(session, clientId) {
  if (!session) return false;
  if (session.role === 'admin') return true;
  return session.role === 'client' && session.clientId === clientId;
}

function checkAdminCredentials(username, password) {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) return { configured: false, ok: false };
  // evaluate both so the time taken does not reveal which one was wrong
  const userOk = safeEqualText(username ?? '', expectedUser);
  const passOk = safeEqualText(password ?? '', expectedPass);
  return { configured: true, ok: userOk && passOk };
}

/** The secret part of a client's dashboard link. */
function clientAccessKey(clientId) {
  return hmac(`client-access:${clientId}`).subarray(0, 16).toString('hex');
}

function verifyClientAccessKey(clientId, key) {
  try {
    return safeEqual(clientAccessKey(clientId), String(key || ''));
  } catch (_) {
    return false;
  }
}

/** True when the request arrived over https (directly or through a proxy such as Vercel). */
function isHttps(request) {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  try { return new URL(request.url).protocol === 'https:'; } catch (_) { return false; }
}

function cookieOptions(request, maxAge) {
  return { httpOnly: true, sameSite: 'lax', path: '/', maxAge, secure: isHttps(request) };
}

module.exports = {
  ADMIN_COOKIE, CLIENT_COOKIE, ADMIN_TTL_SECONDS, CLIENT_TTL_SECONDS,
  signToken, verifyToken, createAdminToken, createClientToken,
  sessionFromCookies, parseCookies, getRequestSession, canAccessClient,
  checkAdminCredentials, clientAccessKey, verifyClientAccessKey, cookieOptions, isHttps,
};
