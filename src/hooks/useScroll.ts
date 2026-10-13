import { useState, useEffect, useCallback } from 'react';

export function useScroll(threshold = 4) {
    const [scrolled, setScrolled] = useState(false);

    const onScroll = useCallback(() => {
        setScrolled((window.scrollY || 0) > threshold);
    }, [threshold]);

    useEffect(() => {
        window.addEventListener('scroll', onScroll, { passive: true });
        // A reload, back/forward or hash load can restore a scroll offset without a scroll event after mount.
        onScroll();
        return () => window.removeEventListener('scroll', onScroll);
    }, [onScroll]);

    return { scrolled };
}
