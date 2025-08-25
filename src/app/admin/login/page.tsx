"use client";
import { useState } from 'react';
import { internalFetch } from '@/lib/internalFetch';

export default function AdminLoginPage() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle'|'success'|'error'>('idle');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('idle');
    try {
      const res = await internalFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ token }), headers: { 'content-type': 'application/json' } });
      if (!res.ok) throw new Error('bad');
      setStatus('success');
      window.location.href = '/admin/analytics';
    } catch {
      setStatus('error');
    }
  }
  return (
    <main className="mx-auto max-w-sm p-6 space-y-4">
      <h1 className="text-xl font-semibold">Admin Login</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Admin Secret</label>
          <input value={token} onChange={e=>setToken(e.target.value)} type="password" className="w-full border rounded px-2 py-1" placeholder="Enter secret" />
        </div>
        <button type="submit" className="bg-teal-600 text-white px-3 py-1 rounded hover:bg-teal-700">Login</button>
        {status==='error' && <div className="text-sm text-red-600">Authentication failed</div>}
      </form>
    </main>
  );
}
