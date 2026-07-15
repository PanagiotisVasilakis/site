import { formatTraceContextHeaders, parseTraceContextHeaders, SpanStatus } from '@/lib/observability-contracts';
import type { Span, SpanLogLevel, TraceApi, TraceContext } from '@/lib/observability-contracts';

export { SpanStatus } from '@/lib/observability-contracts';

const HEX_CHARS = '0123456789abcdef';

function randomHex(length: number): string {
  let result = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    result += HEX_CHARS[bytes[i] % 16];
  }
  return result;
}

function createTraceId(): string {
  return randomHex(32);
}

function createSpanId(): string {
  return randomHex(16);
}

type StartSpanTags = Record<string, unknown> | undefined;

export const tracer: TraceApi = {
  extractTraceContext(headers: Record<string, string>): TraceContext | null {
    return parseTraceContextHeaders(headers);
  },

  injectTraceContext(context: TraceContext): Record<string, string> {
    return formatTraceContextHeaders(context);
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
      status: SpanStatus.OK,
      component: typeof tags?.component === 'string' ? tags.component : 'edge',
    };
  },

  finishSpan(span: Span, status: SpanStatus = SpanStatus.OK): void {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;
  },

  addTags(span: Span, tags: Record<string, unknown>): void {
    Object.assign(span.tags, tags);
  },

  addLog(span: Span, level: SpanLogLevel, message: string, fields?: Record<string, unknown>): void {
    span.logs.push({ timestamp: Date.now(), level, message, fields });
  },
};
