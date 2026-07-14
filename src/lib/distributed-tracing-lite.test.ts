import { SpanStatus, tracer } from './distributed-tracing-lite';

describe('edge-compatible tracing', () => {
  it('extracts and injects W3C trace context', () => {
    const context = tracer.extractTraceContext({
      traceparent: '00-11111111111111111111111111111111-2222222222222222-01',
    });
    expect(context).toEqual({
      traceId: '11111111111111111111111111111111',
      spanId: '2222222222222222',
      flags: 1,
    });
    expect(tracer.injectTraceContext(context!)).toEqual({
      traceparent: '00-11111111111111111111111111111111-2222222222222222-01',
      'x-trace-id': '11111111111111111111111111111111:2222222222222222',
    });
    expect(tracer.extractTraceContext({})).toBeNull();
  });

  it('supports the legacy trace header and rejects malformed context', () => {
    expect(tracer.extractTraceContext({ 'x-trace-id': `${'a'.repeat(32)}:${'b'.repeat(16)}` }))
      .toEqual({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), flags: 1 });
    expect(tracer.extractTraceContext({ 'x-trace-id': 'trace-id:span-id' })).toBeNull();
    expect(tracer.extractTraceContext({ traceparent: 'invalid' })).toBeNull();
    expect(tracer.extractTraceContext({
      traceparent: `00-${'0'.repeat(32)}-${'2'.repeat(16)}-01`,
    })).toBeNull();
  });

  it('creates, enriches, logs, and finishes a child span', () => {
    const span = tracer.startSpan(
      'booking.deliver',
      { traceId: 'parent-trace', spanId: 'parent-span', flags: 1 },
      { component: 'outbox' },
    );
    expect(span.traceId).toBe('parent-trace');
    expect(span.parentSpanId).toBe('parent-span');
    expect(span.spanId).toHaveLength(16);
    tracer.addTags(span, { attempt: 1 });
    tracer.addLog(span, 'info', 'delivery started', { eventId: 'event-1' });
    tracer.finishSpan(span, SpanStatus.OK);
    expect(span.tags).toEqual(expect.objectContaining({ attempt: 1 }));
    expect(span.status).toBe(SpanStatus.OK);
    expect(span.logs).toHaveLength(1);
    expect(span.duration).toBeGreaterThanOrEqual(0);
  });
});
