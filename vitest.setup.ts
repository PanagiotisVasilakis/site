import '@testing-library/jest-dom/vitest';

// Filter noisy styled-jsx boolean attribute warnings (React 19 change)
const originalError = console.error;
console.error = (...args: unknown[]) => {
	if (typeof args[0] === 'string' && /Received `true` for a non-boolean attribute `(jsx|global)`/.test(args[0])) {
		return; // suppress
	}
	originalError(...args);
};
 
// Mock next/image to avoid DOM warnings for boolean attributes like `fill`/`priority` in JSDOM
// and to render as a plain <img> in tests.
import React from 'react';
vi.mock('next/image', () => {
	const Img = (props: Record<string, unknown>) => {
		const { src, alt, fill: _fill, priority: _priority, ...rest } = props as { src?: string | { src?: string }; alt?: string } & Record<string, unknown>;
		// Mark stripped boolean attributes as intentionally unused to satisfy lint
		void _fill; void _priority;
		const resolvedSrc = typeof src === 'string'
			? src
			: (src && typeof src === 'object' && 'src' in src ? (src as { src?: string }).src : undefined);
		return React.createElement('img', { src: resolvedSrc, alt, ...rest });
	};
	return { default: Img };
});
