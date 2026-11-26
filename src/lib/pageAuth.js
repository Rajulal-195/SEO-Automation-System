// src/lib/pageAuth.js
// Auth checks for server-rendered pages. Every page calls these itself: a layout
// is not re-run on every client-side navigation, so layouts cannot be the only guard.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, CLIENT_COOKIE, sessionFromCookies } from '@/lib/auth';

export function currentSession() {
  const jar = cookies();
  return sessionFromCookies({
    admin: jar.get(ADMIN_COOKIE)?.value,
    client: jar.get(CLIENT_COOKIE)?.value,
  });
}

export function requireAdmin() {
  const session = currentSession();
  if (!session || session.role !== 'admin') redirect('/login');
  return session;
}
