// GET /client/access?c=<clientId>&k=<key>
// The private link an admin sends to a client. A valid link signs the browser in
// to that one client's dashboard, then redirects to /client (so the key leaves the URL).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CLIENT_COOKIE, CLIENT_TTL_SECONDS, createClientToken, verifyClientAccessKey, cookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const clientId = params.get('c') || '';
  const key = params.get('k') || '';
  const invalid = () => NextResponse.redirect(new URL('/client?error=invalid-link', req.url));

  if (!clientId || !verifyClientAccessKey(clientId, key)) return invalid();

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return invalid();

  const res = NextResponse.redirect(new URL('/client', req.url));
  res.cookies.set({ name: CLIENT_COOKIE, value: createClientToken(client.id), ...cookieOptions(req, CLIENT_TTL_SECONDS) });
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
