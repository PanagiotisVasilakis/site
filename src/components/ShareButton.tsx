"use client";
import { useState } from 'react';

export default function ShareButton({ title, text }: { title: string; text?: string }) {
	const [copied, setCopied] = useState(false);
	const share = async () => {
		const url = window.location.href;
		if (navigator.share) {
			try { await navigator.share({ title, text: text || title, url }); } catch {}
			return;
		}
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {}
	};
	return (
		<button onClick={share} className="flex items-center gap-1 rounded px-3 py-2 text-sm border border-teal-300 text-teal-800 bg-white/70 hover:bg-white">
			<span>{copied ? '✅' : '🔗'}</span>
			<span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
		</button>
	);
}
