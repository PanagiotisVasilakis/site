/**
 * Lightweight metrics implementation for Edge runtime.
 * Provides no-op collectors so middleware code can run without Node-only dependencies.
 */

import type { MetricSink } from '@/lib/observability-contracts';

function noop(): void {
  // No-op implementation for Lite version
}

const metricsLite: MetricSink = {
  counter: () => noop(),
  gauge: () => noop(),
  histogram: () => noop(),
  timer: () => noop(),
};

export const metrics = metricsLite;
