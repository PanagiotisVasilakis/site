"use client";

export default function DescriptionBox({ title, description }: { title?: string; description?: string }) {
    if (!title && !description) return null;

    return (
        <div className="description-box">
            {title && <h2 className="description-box-title text-xl font-serif italic font-bold">{title}</h2>}
            {description && <p className="description-box-copy text-base leading-relaxed">{description}</p>}
        </div>
    );
}
