'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function LogoutButton({ redirectTo = '/login', label = 'Sign out' }) {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) { /* leave the page anyway */ }
    window.location.assign(redirectTo);
  }
  return <Button variant="outline" size="sm" onClick={logout} disabled={busy} data-testid="logout">{label}</Button>;
}
