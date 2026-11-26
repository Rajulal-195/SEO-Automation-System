// POST /api/auth/login  { username, password }  ->  sets the admin session cookie
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_TTL_SECONDS, checkAdminCredentials, createAdminToken, cookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const FAILED_LOGIN_DELAY_MS = 700; // slows down password guessing

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (_) {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const username = typeof body?.username === 'string' ? body.username : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  const creds = checkAdminCredentials(username, password);
  if (!creds.configured) {
    return NextResponse.json({ error: 'Admin login is not configured on the server' }, { status: 503 });
  }
  if (!creds.ok) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    return NextResponse.json({ error: 'Incorrect username or password' }, { status: 401 });
  }

  let token;
  try {
    token = createAdminToken(username);
  } catch (err) {
    console.error('[login]', err.message);
    return NextResponse.json({ error: 'Sessions are not configured on the server (AUTH_SECRET)' }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: ADMIN_COOKIE, value: token, ...cookieOptions(req, ADMIN_TTL_SECONDS) });
  return res;
}
