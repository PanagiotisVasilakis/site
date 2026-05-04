import type { ReactNode } from 'react';
import { Surface } from './Surface';

interface EmptyPanelProps {
  title?: ReactNode;
  children?: ReactNode;
}

export function EmptyPanel({ title, children }: EmptyPanelProps) {
  return (
    <Surface padding="xl" radius="md" shadow="sm" className="text-center">
      {title ? <h2 className="font-serif text-2xl font-semibold italic section-title">{title}</h2> : null}
      {children ? <div className={title ? 'mt-2 text-sm text-body' : 'text-sm text-body'}>{children}</div> : null}
    </Surface>
  );
}
