'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function RunAuditButton({ clientId, size = 'sm', label = 'Run audit' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok || (res.status === 409 && body.auditId)) {
        router.push(`/admin/audits/${body.auditId}`); // 409: an audit is already running, show it
        return;
      }
      if (res.status === 401) { window.location.assign('/login'); return; }
      setError(body.error || 'Could not start the audit');
    } catch (_) {
      setError('Could not reach the server');
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size={size} onClick={run} disabled={busy} data-testid="run-audit">{busy ? 'Starting...' : label}</Button>
      {error && <span role="alert" className="text-xs text-red-600" data-testid="run-audit-error">{error}</span>}
    </span>
  );
}
