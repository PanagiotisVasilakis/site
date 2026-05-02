"use client";
import { useState } from 'react';
import internalFetch, { ADMIN_SECRET_STORAGE_KEY } from '@/lib/internalFetchClient';

export default function AdminLoginPage() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('idle');
    try {
      const res = await internalFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ token }), headers: { 'content-type': 'application/json' } });
      if (!res.ok) throw new Error('bad');
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage?.setItem(ADMIN_SECRET_STORAGE_KEY, token);
        }
      } catch (err) {
        console.warn('Failed to persist admin secret', err);
      }
      setStatus('success');
      window.location.href = `/admin?token=${encodeURIComponent(token)}`;
    } catch {
      setStatus('error');
    }
  }
  return (
    <div className="mx-auto max-w-sm p-6 space-y-4">
      <h1 className="text-xl font-serif italic font-bold">Admin Login</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Admin Secret</label>
          <input value={token} onChange={e => setToken(e.target.value)} type="password" className="w-full border rounded px-2 py-1" placeholder="Enter secret" />
        </div>
        <button type="submit" className="btn-primary btn-sm">Login</button>
        {status === 'error' && <div className="text-sm text-red-600">Authentication failed</div>}
      </form>
    </div>
  );
}
