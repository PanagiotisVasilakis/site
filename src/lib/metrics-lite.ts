/**
 * Lightweight metrics implementation for Edge runtime.
 * Provides no-op collectors so middleware code can run without Node-only dependencies.
 */

type MetricTags = Record<string, string> | undefined;

type MetricsLite = {
  counter: (name: string, value?: number, tags?: MetricTags) => void;
  gauge: (name: string, value: number, tags?: MetricTags) => void;
  histogram: (name: string, value: number, tags?: MetricTags) => void;
  timer: (name: string, duration: number, tags?: MetricTags) => void;
};

function noop(): void {
  // No-op implementation for Lite version
}

const metricsLite: MetricsLite = {
  counter: () => noop(),
  gauge: () => noop(),
  histogram: () => noop(),
  timer: () => noop(),
};

export const metrics = metricsLite;
export type { MetricsLite };

