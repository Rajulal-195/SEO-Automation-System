import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/pageAuth';
import LoginForm from '@/components/admin/LoginForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin sign in | Edgelink SEO' };

export default function LoginPage() {
  const session = currentSession();
  if (session && session.role === 'admin') redirect('/admin');

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Edgelink Technology</p>
          <CardTitle className="text-xl">Admin sign in</CardTitle>
          <CardDescription>Use the admin credentials for this deployment.</CardDescription>
        </CardHeader>
        <CardContent><LoginForm /></CardContent>
      </Card>
    </main>
  );
}
