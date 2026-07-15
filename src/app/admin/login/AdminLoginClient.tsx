"use client";

import { useState } from 'react';
import internalFetch from '@/lib/internalFetchClient';

export default function AdminLoginClient() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('idle');
    try {
      const response = await internalFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ token }),
        headers: { 'content-type': 'application/json' },
      });
      if (!response.ok) throw new Error('Authentication failed');
      setStatus('success');
      window.location.assign('/admin');
    } catch {
      setStatus('error');
    }
  }

  return (
    <main className="mx-auto max-w-sm p-6 space-y-4">
      <h1 className="text-xl font-serif italic font-bold">Admin Login</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="admin-secret" className="block text-sm font-medium mb-1">Admin Secret</label>
          <input
            id="admin-secret"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            autoComplete="current-password"
            required
            className="w-full border rounded px-2 py-1"
            placeholder="Enter secret"
            aria-invalid={status === 'error'}
            aria-describedby={status === 'error' ? 'admin-login-error' : undefined}
          />
        </div>
        <button type="submit" className="btn-primary btn-sm">Login</button>
        <div aria-live="polite">
          {status === 'error' && <p id="admin-login-error" className="text-sm text-red-600">Authentication failed</p>}
        </div>
      </form>
    </main>
  );
}
