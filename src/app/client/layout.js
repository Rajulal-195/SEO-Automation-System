import { currentSession } from '@/lib/pageAuth';
import LogoutButton from '@/components/admin/LogoutButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your SEO report | Edgelink' };

export default function ClientLayout({ children }) {
  const session = currentSession();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-sm font-bold tracking-wide text-slate-900">EDGELINK <span className="font-normal text-slate-500">Client dashboard</span></span>
          {session && session.role === 'client' && <LogoutButton redirectTo="/client" />}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
