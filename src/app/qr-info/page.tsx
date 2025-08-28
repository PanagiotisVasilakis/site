import React from 'react';

export const dynamic = 'force-static';

export default function QrInfoPage() {
  const qrSrc = '/qr';
  return (
  <div className="mx-auto max-w-md p-6 flex flex-col items-center gap-6 text-brand-800">
      <h1 className="text-xl font-semibold">QR Code</h1>
      <div className="relative group">
        <img src={qrSrc} alt="QR code linking to the guide" className="w-64 h-64 shadow rounded bg-white p-2" />
        <span
          className="peer absolute -top-2 -right-2 inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-medium cursor-help"
          style={{background:'var(--brand-600)'}}
          aria-describedby="qr-help"
        >i</span>
        <div
          id="qr-help"
          className="pointer-events-none opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 absolute z-10 -top-3 right-8 w-44 text-white text-[11px] p-2 rounded shadow-lg after:content-[''] after:absolute after:top-2 after:right-[-6px] after:border-8 after:border-transparent"
          style={{background:'var(--brand-800)', boxShadow:'0 4px 16px -4px rgba(0,0,0,0.35)'}}
          role="tooltip"
        >
          Scan this with your phone camera. Tap the link popup. After first load the guide works offline.
        </div>
      </div>
  <p className="text-sm text-center leading-relaxed" style={{color:'var(--brand-700)'}}>
        Open this page on a laptop/desktop to scan the QR with your phone.
      </p>
    </div>
  );
}
