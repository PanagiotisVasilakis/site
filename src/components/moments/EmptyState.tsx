"use client";

interface EmptyStateProps {
    message?: string;
    onClear?: () => void;
}

export function EmptyState({
    message = 'No places found. Try another category or clear your search.',
    onClear,
}: EmptyStateProps) {
    return (
        <div className="moments-empty-state" role="status" aria-live="polite">
            <div className="moments-empty-icon" aria-hidden>
                <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="m16 16 4 4" />
                </svg>
            </div>
            <p>{message}</p>
            {onClear && (
                <button type="button" className="moments-empty-action" onClick={onClear}>
                    Clear search
                </button>
            )}
        </div>
    );
}
