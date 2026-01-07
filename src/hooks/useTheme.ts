import { useState, useEffect, useCallback } from 'react';

/**
 * A hook that provides reactive theme detection.
 * Listens to both the `data-theme` attribute on `<html>` and system preferences.
 * 
 * @returns {Object} Theme state
 * @returns {boolean} isDark - Whether dark mode is active
 * @returns {boolean} isLight - Convenience inverse of isDark
 * @returns {'dark' | 'light'} theme - The current theme as a string
 */
export function useTheme() {
    const [isDark, setIsDark] = useState(false);

    const checkTheme = useCallback(() => {
        if (typeof window === 'undefined') return;

        // Priority: explicit data-theme attribute > system preference
        const htmlTheme = document.documentElement.getAttribute('data-theme');
        if (htmlTheme) {
            setIsDark(htmlTheme === 'dark');
            return;
        }

        // Fallback to system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setIsDark(prefersDark);
    }, []);

    useEffect(() => {
        // Initial check
        checkTheme();

        // Watch for data-theme attribute changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                    checkTheme();
                }
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });

        // Watch for system preference changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleMediaChange = () => checkTheme();
        mediaQuery.addEventListener('change', handleMediaChange);

        return () => {
            observer.disconnect();
            mediaQuery.removeEventListener('change', handleMediaChange);
        };
    }, [checkTheme]);

    return {
        isDark,
        isLight: !isDark,
        theme: isDark ? 'dark' : 'light'
    } as const;
}
