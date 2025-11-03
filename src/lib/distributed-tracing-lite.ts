/**
 * Minimal distributed tracing implementation compatible with the Edge runtime.
 * Mirrors the public API used by middleware without depending on Node-only features.
 */

type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  flags: number;
};

type SpanLogLevel = 'info' | 'warn' | 'error' | 'debug';

type Span = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, unknown>;
  logs: Array<{
    timestamp: number;
    level: SpanLogLevel;
    message: string;
    fields?: Record<string, unknown>;
  }>;
  component?: string;
};

const HEX_CHARS = '0123456789abcdef';

function randomHex(length: number): string {
  let result = '';
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined;

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      result += HEX_CHARS[bytes[i] % 16];
    }
    return result;
  }

  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * 16);
    result += HEX_CHARS[idx];
  }
  return result;
}

function createTraceId(): string {
  return randomHex(32);
}

function createSpanId(): string {
  return randomHex(16);
}

export enum SpanStatus {
  OK = 'ok',
  ERROR = 'error',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled',
}

type StartSpanTags = Record<string, unknown> | undefined;

export const tracer = {
  extractTraceContext(headers: Record<string, string>): TraceContext | null {
    const header = headers['traceparent'] || headers['x-trace-id'];
    if (!header) return null;

    if (header.startsWith('00-')) {
      const parts = header.split('-');
      if (parts.length === 4) {
        return {
          traceId: parts[1],
          spanId: parts[2],
          flags: parseInt(parts[3], 16) || 1,
        };
      }
    }

    const [traceId, spanId] = header.split(':');
    if (traceId && spanId) {
      return { traceId, spanId, flags: 1 };
    }

    return null;
  },

  injectTraceContext(context: TraceContext): Record<string, string> {
    return {
      'traceparent': `00-${context.traceId}-${context.spanId}-${context.flags.toString(16).padStart(2, '0')}`,
      'x-trace-id': `${context.traceId}:${context.spanId}`,
    };
  },

  startSpan(operationName: string, parentContext?: TraceContext | null, tags: StartSpanTags = {}): Span {
    return {
      traceId: parentContext?.traceId || createTraceId(),
      spanId: createSpanId(),
      parentSpanId: parentContext?.spanId,
      operationName,
      startTime: Date.now(),
      tags: { ...tags },
      logs: [],
      component: typeof tags?.component === 'string' ? (tags.component as string) : undefined,
    };
  },

  finishSpan(span: Span, status: SpanStatus = SpanStatus.OK): void {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.tags.status = status;
  },

  addTags(span: Span, tags: Record<string, unknown>): void {
    Object.assign(span.tags, tags);
  },

  addLog(span: Span, level: SpanLogLevel, message: string, fields?: Record<string, unknown>): void {
    span.logs.push({ timestamp: Date.now(), level, message, fields });
  },
};

export type { TraceContext, Span };
