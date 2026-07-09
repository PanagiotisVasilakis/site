"use client";
import { useState } from 'react';
import { logger } from '@/lib/logger-client';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

export default function ShareButton({ title, text, className = "fav-btn", locale = 'en' }: { title: string; text?: string; className?: string; locale?: string }) {
	const [copied, setCopied] = useState(false);
	const t = getDictionary(locale as Locale);
	const copiedLabel = t.checkinInfo?.copied ?? 'Copied';
	const shareLabel = t.labels?.share ?? 'Share';
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
			<span>{copied ? copiedLabel : shareLabel}</span>
		</button>
	);
}
