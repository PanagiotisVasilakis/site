import type React from 'react';
import clsx from 'clsx';

type SectionProps = {
  id: string;
  title: React.ReactNode;
  eyebrow?: string;
  lead?: string;
  /**
   * `band` (deep sea) and `warm` (terracotta gradient) are full-bleed; `default` sits on bg.
   * `plain` is the §9.3 information block: a `d3` title and a `fg-muted` body of at most 65ch.
   */
  variant?: 'default' | 'band' | 'warm' | 'plain';
  className?: string;
  children: React.ReactNode;
};

/**
 * identity §8 Section: head = Eyebrow + Title (`d2`) + Lead, then the content (styles in
 * src/styles/components/ui.css). The head is never inside a transformed element. The sunken variant
 * arrives with its first consumer.
 */
export function Section({ id, title, eyebrow, lead, variant = 'default', className, children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={clsx('ui-section', variant !== 'default' && `ui-section--${variant}`, className)}
    >
      <div className="ui-section__head">
        {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
        <h2 id={`${id}-title`} className="ui-section__title">{title}</h2>
        {lead ? <p className="ui-section__lead">{lead}</p> : null}
      </div>
      {variant === 'plain' ? <div className="ui-section__body">{children}</div> : children}
    </section>
  );
}
