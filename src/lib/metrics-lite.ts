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
  // Intentionally empty for Edge runtime compatibility.
}

const metricsLite: MetricsLite = {
  counter: (_name: string, _value: number = 1, _tags?: MetricTags) => noop(),
  gauge: (_name: string, _value: number, _tags?: MetricTags) => noop(),
  histogram: (_name: string, _value: number, _tags?: MetricTags) => noop(),
  timer: (_name: string, _duration: number, _tags?: MetricTags) => noop(),
};

export const metrics = metricsLite;
export type { MetricsLite };
