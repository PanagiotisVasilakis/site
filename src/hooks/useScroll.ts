import { useState, useEffect, useRef, useCallback } from 'react';

export function useScroll(threshold = 4) {
    const [scrolled, setScrolled] = useState(false);
    const [hidden, setHidden] = useState(false);
    const lastY = useRef(0);

    const onScroll = useCallback(() => {
        const y = window.scrollY || 0;
        setScrolled(y > threshold);

        const delta = y - lastY.current;
        // Hide when scrolling down past 80px and moving down > 10px
        if (y > 80 && delta > 10) {
            setHidden(true);
        } else if (delta < -10) {
            // Show when scrolling up
            setHidden(false);
        }
        lastY.current = y;
    }, [threshold]);

    useEffect(() => {
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [onScroll]);

    return { scrolled, hidden };
}
