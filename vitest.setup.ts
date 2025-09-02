import '@testing-library/jest-dom/vitest';

// Filter noisy styled-jsx boolean attribute warnings (React 19 change)
const originalError = console.error;
console.error = (...args: any[]) => {
	if (typeof args[0] === 'string' && /Received `true` for a non-boolean attribute `(jsx|global)`/.test(args[0])) {
		return; // suppress
	}
	originalError(...args);
};
