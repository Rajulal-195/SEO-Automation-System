// POST /api/auth/logout  ->  clears both session cookies
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, CLIENT_COOKIE, cookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const res = NextResponse.json({ ok: true });
  for (const name of [ADMIN_COOKIE, CLIENT_COOKIE]) {
    res.cookies.set({ name, value: '', ...cookieOptions(req, 0) });
  }
  return res;
}
