import type { ReactNode } from 'react';
import { Surface } from './Surface';

interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
}

export function MetricCard({ label, value }: MetricCardProps) {
  return (
    <Surface padding="sm" radius="md" shadow="sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] admin-muted">{label}</p>
        <p className="mt-2 text-3xl font-semibold admin-accent">{value}</p>
      </div>
    </Surface>
  );
}
