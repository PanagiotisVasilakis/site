"use client";
import { useState } from 'react';
import { logger } from '@/lib/logger-client';

export default function ShareButton({ title, text, className = "fav-btn" }: { title: string; text?: string; className?: string }) {
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
		<button onClick={share} className={className}>
			<span>{copied ? '✅' : '🔗'}</span>
			<span>{copied ? 'Copied' : 'Share'}</span>
		</button>
	);
}
