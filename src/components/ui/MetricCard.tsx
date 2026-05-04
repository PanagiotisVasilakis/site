import type { ReactNode } from 'react';
import { Surface } from './Surface';

interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  valueClassName?: string;
}

export function MetricCard({ label, value, icon, valueClassName = 'text-text-accent' }: MetricCardProps) {
  return (
    <Surface padding="sm" radius="md" shadow="sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{label}</p>
          <p className={`mt-2 text-3xl font-semibold ${valueClassName}`}>{value}</p>
        </div>
        {icon ? <div className="text-3xl" aria-hidden>{icon}</div> : null}
      </div>
    </Surface>
  );
}
