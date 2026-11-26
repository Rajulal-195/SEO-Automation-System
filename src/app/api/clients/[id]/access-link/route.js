// GET /api/clients/:id/access-link  ->  the private dashboard link for this client (admin only)
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestSession, clientAccessKey } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const session = getRequestSession(req);
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const client = await prisma.client.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  let key;
  try {
    key = clientAccessKey(client.id);
  } catch (err) {
    return NextResponse.json({ error: 'Sessions are not configured on the server (AUTH_SECRET)' }, { status: 503 });
  }

  const base = (process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '') || new URL(req.url).origin;
  const url = `${base}/client/access?c=${encodeURIComponent(client.id)}&k=${key}`;
  return NextResponse.json({ url, clientName: client.name }, { headers: { 'Cache-Control': 'no-store' } });
}
