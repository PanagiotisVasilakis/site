"use client";
import { useState } from 'react';
import { logger } from '@/lib/logger-client';

export default function ShareButton({ title, text }: { title: string; text?: string }) {
	const [copied, setCopied] = useState(false);
	const share = async () => {
		const url = window.location.href;
		if (navigator.share) {
			try { await navigator.share({ title, text: text || title, url }); } catch (err) { logger.warn('Native share failed', err instanceof Error ? err : { error: String(err) }); }
			return;
		}
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) { logger.warn('Clipboard copy failed', err instanceof Error ? err : { error: String(err) }); }
	};
	return (
		<button onClick={share} className="fav-btn">
			<span>{copied ? '✅' : '🔗'}</span>
			<span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
		</button>
	);
}
