"use client";

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface GuideOptionCardProps {
  href: string;
  title: string;
  summary?: string;
  image?: string;
  imageAlt?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
  minHeightClass?: string;
}

export default function GuideOptionCard({
  href,
  title,
  summary,
  image,
  imageAlt,
  icon,
  meta,
  action,
  className = '',
  minHeightClass = 'min-h-[220px]',
}: GuideOptionCardProps) {
  return (
    <div className={`guide-option-card-shell ${className}`.trim()}>
      <Link href={href} className={`guide-option-card group ${minHeightClass}`.trim()}>
        <span className="guide-option-icon" aria-hidden>
          {image ? (
            <Image
              src={image}
              alt={imageAlt || title}
              width={58}
              height={58}
              className="h-full w-full object-contain"
            />
          ) : (
            icon
          )}
        </span>
        <span className="guide-option-title">{title}</span>
        {summary && <span className="guide-option-summary">{summary}</span>}
        {meta && <span className="guide-option-meta">{meta}</span>}
      </Link>
      {action}
    </div>
  );
}
