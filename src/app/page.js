import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 px-6 py-14 text-center text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Edgelink Technology</p>
        <h1 className="mt-3 text-4xl font-bold">SEO Automation Dashboard</h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-300">
          Automated website audits: crawl, AI analysis, a scored report as a PDF, and delivery by WhatsApp and email.
        </p>
      </div>
      <div className="mx-auto grid max-w-3xl gap-6 px-6 py-10 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Admin portal</CardTitle>
            <CardDescription>Manage clients, run audits and watch them progress live.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login" className={buttonVariants({ size: 'lg' })} data-testid="admin-link">Sign in as admin</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Client dashboard</CardTitle>
            <CardDescription>Clients see their score, recommendations and PDF reports. Open the private link your account manager sent you.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/client" className={buttonVariants({ variant: 'outline', size: 'lg' })} data-testid="client-link">Open my dashboard</Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
