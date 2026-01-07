import { useState, useEffect, useCallback } from 'react';

/**
 * A hook for safely reading/writing to localStorage with automatic JSON serialization.
 * Handles SSR, storage events for cross-tab sync, and catches quota/permission errors.
 *
 * @param key - The localStorage key
 * @param initialValue - Default value if key doesn't exist
 * @returns [value, setValue, removeValue] tuple
 */
export function useLocalStorage<T>(
    key: string,
    initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
    // Get initial value from localStorage or use default
    const readValue = useCallback((): T => {
        if (typeof window === 'undefined') {
            return initialValue;
        }

        try {
            const item = localStorage.getItem(key);
            return item ? (JSON.parse(item) as T) : initialValue;
        } catch {
            return initialValue;
        }
    }, [key, initialValue]);

    const [storedValue, setStoredValue] = useState<T>(readValue);

    // Update state and localStorage
    const setValue = useCallback(
        (value: T | ((prev: T) => T)) => {
            try {
                // Allow value to be a function for same API as useState
                const valueToStore = value instanceof Function ? value(storedValue) : value;
                setStoredValue(valueToStore);

                if (typeof window !== 'undefined') {
                    localStorage.setItem(key, JSON.stringify(valueToStore));

                    // Dispatch storage event for cross-tab sync
                    window.dispatchEvent(new StorageEvent('storage', { key }));
                }
            } catch (error) {
                // Quota exceeded or permission denied - fail silently
                console.warn(`useLocalStorage: Failed to set "${key}"`, error);
            }
        },
        [key, storedValue]
    );

    // Remove from localStorage
    const removeValue = useCallback(() => {
        try {
            if (typeof window !== 'undefined') {
                localStorage.removeItem(key);
                setStoredValue(initialValue);
            }
        } catch {
            // Fail silently
        }
    }, [key, initialValue]);

    // Sync with other tabs/windows
    useEffect(() => {
        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === key && event.newValue !== null) {
                try {
                    setStoredValue(JSON.parse(event.newValue) as T);
                } catch {
                    // Invalid JSON, ignore
                }
            } else if (event.key === key && event.newValue === null) {
                setStoredValue(initialValue);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [key, initialValue]);

    // Re-read on mount (handles SSR hydration)
    useEffect(() => {
        setStoredValue(readValue());
    }, [readValue]);

    return [storedValue, setValue, removeValue];
}
