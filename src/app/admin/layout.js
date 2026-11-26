import Link from 'next/link';
import { currentSession } from '@/lib/pageAuth';
import LogoutButton from '@/components/admin/LogoutButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin | Edgelink SEO' };

// Visual shell only. Every admin page also calls requireAdmin() itself, because a
// layout is not re-run on client-side navigation and so cannot be the only guard.
export default function AdminLayout({ children }) {
  const session = currentSession();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm font-bold tracking-wide text-slate-900">EDGELINK <span className="hidden font-normal text-slate-500 sm:inline">SEO Admin</span></Link>
            <nav className="hidden text-sm sm:block"><Link href="/admin" className="text-slate-600 hover:text-slate-900">Overview</Link></nav>
          </div>
          {session && session.role === 'admin' && (
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="hidden sm:inline" data-testid="signed-in-as">{session.username}</span>
              <LogoutButton />
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
