export enum SpanStatus {
  OK = 'ok',
  ERROR = 'error',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled',
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  flags: number;
  baggage?: Record<string, string>;
}

function isLowerHex(value: string, length: number): boolean {
  return value.length === length && value.split('').every((character) => (
    (character >= '0' && character <= '9') || (character >= 'a' && character <= 'f')
  ));
}

export function parseTraceContextHeaders(headers: Record<string, string>): TraceContext | null {
  const traceparent = headers.traceparent?.trim().toLowerCase();
  if (traceparent) {
    const parts = traceparent.split('-');
    if (parts.length === 4
      && parts[0] === '00'
      && isLowerHex(parts[1], 32)
      && parts[1] !== '0'.repeat(32)
      && isLowerHex(parts[2], 16)
      && parts[2] !== '0'.repeat(16)
      && isLowerHex(parts[3], 2)) {
      return { traceId: parts[1], spanId: parts[2], flags: Number.parseInt(parts[3], 16) };
    }
    return null;
  }

  const legacy = headers['x-trace-id']?.trim().toLowerCase();
  if (!legacy) return null;
  const [traceId, spanId, extra] = legacy.split(':');
  return !extra && isLowerHex(traceId, 32) && traceId !== '0'.repeat(32)
    && isLowerHex(spanId, 16) && spanId !== '0'.repeat(16)
    ? { traceId, spanId, flags: 1 }
    : null;
}

export function formatTraceContextHeaders(context: TraceContext): Record<string, string> {
  const flags = Math.min(Math.max(Math.trunc(context.flags), 0), 255).toString(16).padStart(2, '0');
  return {
    traceparent: `00-${context.traceId}-${context.spanId}-${flags}`,
    'x-trace-id': `${context.traceId}:${context.spanId}`,
  };
}

export type SpanLogLevel = 'info' | 'warn' | 'error' | 'debug';

interface SpanLog {
  timestamp: number;
  level: SpanLogLevel;
  message: string;
  fields?: Record<string, unknown>;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, unknown>;
  logs: SpanLog[];
  status: SpanStatus;
  component: string;
}

export interface TraceApi {
  extractTraceContext(headers: Record<string, string>): TraceContext | null;
  injectTraceContext(context: TraceContext): Record<string, string>;
  startSpan(operationName: string, parentContext?: TraceContext, tags?: Record<string, unknown>): Span;
  finishSpan(span: Span, status?: SpanStatus): void;
  addTags(span: Span, tags: Record<string, unknown>): void;
  addLog(span: Span, level: SpanLogLevel, message: string, fields?: Record<string, unknown>): void;
}

type MetricTags = Record<string, string>;

export interface MetricSink {
  counter(name: string, value?: number, tags?: MetricTags): void;
  gauge(name: string, value: number, tags?: MetricTags): void;
  histogram(name: string, value: number, tags?: MetricTags): void;
  timer(name: string, duration: number, tags?: MetricTags): void;
}
