'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EMPTY = { name: '', websiteUrl: '', businessType: '', city: '', state: '', whatsapp: '', email: '' };

const FIELDS = [
  ['name', 'Business name', 'Smile Dental Clinic', 'text'],
  ['websiteUrl', 'Website URL', 'https://smile-dental.in', 'text'],
  ['businessType', 'Business type', 'Dental clinic', 'text'],
  ['city', 'City', 'Pune', 'text'],
  ['state', 'State', 'Maharashtra', 'text'],
  ['whatsapp', 'WhatsApp number (optional)', '+919999900001', 'tel'],
  ['email', 'Email (optional)', 'owner@smile-dental.in', 'email'],
];

export default function AddClientForm() {
  const router = useRouter();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 201) {
        setValues(EMPTY);
        setMessage(`Added ${body.client.name}`);
        router.refresh();
      } else if (res.status === 401) {
        window.location.assign('/login');
        return;
      } else {
        setErrors(body.fields || {});
        if (!body.fields) setMessage(body.error || 'Could not add the client');
      }
    } catch (_) {
      setMessage('Could not reach the server');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" data-testid="add-client-form" noValidate>
      {FIELDS.map(([key, label, placeholder, type]) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={`client-${key}`}>{label}</Label>
          <Input
            id={`client-${key}`} name={key} type={type} placeholder={placeholder} value={values[key]}
            onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            aria-invalid={Boolean(errors[key])}
          />
          {errors[key] && <p className="text-xs font-medium text-red-600" data-testid={`error-${key}`}>{errors[key]}</p>}
        </div>
      ))}
      <div className="flex items-center gap-4 sm:col-span-2">
        <Button type="submit" size="lg" disabled={busy}>{busy ? 'Adding...' : 'Add client'}</Button>
        {message && <p role="status" className={`text-sm font-medium ${message.startsWith('Added') ? 'text-emerald-700' : 'text-red-600'}`} data-testid="add-client-message">{message}</p>}
      </div>
    </form>
  );
}
