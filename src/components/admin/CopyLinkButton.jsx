'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

// Fetches the client's private dashboard link and copies it to the clipboard.
export default function CopyLinkButton({ clientId }) {
  const [state, setState] = useState('idle'); // idle | busy | copied | error
  const [link, setLink] = useState('');

  async function copy() {
    setState('busy');
    try {
      const res = await fetch(`/api/clients/${clientId}/access-link`, { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const { url } = await res.json();
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
        setState('copied');
        setTimeout(() => setState('idle'), 2500);
      } catch (_) {
        setState('idle'); // clipboard blocked: the link is shown below to copy by hand
      }
    } catch (_) {
      setState('error');
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={copy} disabled={state === 'busy'} data-testid="copy-link">
        {state === 'copied' ? 'Link copied' : state === 'busy' ? 'Getting link...' : 'Copy client link'}
      </Button>
      {state === 'error' && <span role="alert" className="text-xs text-red-600">Could not get the link</span>}
      {link && state !== 'copied' && (
        <input readOnly value={link} onFocus={(e) => e.target.select()} className="w-64 rounded border border-slate-300 px-2 py-1 text-xs" aria-label="Client dashboard link" data-testid="link-field" />
      )}
    </span>
  );
}
