// GET  /api/clients  -> all clients with their latest audit        (admin only)
// POST /api/clients  -> create a client                            (admin only)
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestSession } from '@/lib/auth';
import { validateClientInput } from '@/lib/clientInput';
import { toPlain } from '@/lib/auditShape';

export const dynamic = 'force-dynamic';

function denied(session) {
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  return null;
}

export async function GET(req) {
  const blocked = denied(getRequestSession(req));
  if (blocked) return blocked;

  const clients = await prisma.client.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      audits: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, status: true, progress: true, overallScore: true, createdAt: true, completedAt: true },
      },
    },
  });
  return NextResponse.json({ clients: toPlain(clients) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req) {
  const blocked = denied(getRequestSession(req));
  if (blocked) return blocked;

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const checked = validateClientInput(body);
  if (!checked.ok) {
    return NextResponse.json({ error: 'Please fix the highlighted fields', fields: checked.fields }, { status: 400 });
  }

  const duplicate = () =>
    NextResponse.json(
      { error: 'A client with this website already exists', fields: { websiteUrl: 'This website is already added' } },
      { status: 409 }
    );

  if (await prisma.client.findUnique({ where: { websiteUrl: checked.data.websiteUrl }, select: { id: true } })) {
    return duplicate();
  }

  try {
    const client = await prisma.client.create({ data: checked.data });
    return NextResponse.json({ client: toPlain(client) }, { status: 201 });
  } catch (err) {
    if (err && err.code === 'P2002') return duplicate(); // two requests raced past the check above
    console.error('[POST /api/clients]', err.message);
    return NextResponse.json({ error: 'Could not save the client' }, { status: 500 });
  }
}
