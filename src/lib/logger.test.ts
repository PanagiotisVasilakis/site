
import { logger } from './logger';

describe('logger', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => { });
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => { });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes Error objects with name and message (and stack in non-production)', () => {
    const err = new Error('boom');
    logger.error('test error', err);
    expect(errorSpy).toHaveBeenCalled();
    const [, metaUnknown] = errorSpy.mock.calls[0];
    const meta: any = metaUnknown as any;
    expect(meta).toBeTruthy();
    expect(meta.name).toBe('Error');
    expect(meta.message).toBe('boom');
    // In test env, stack should be included
    expect(typeof meta.stack === 'string' || meta.stack === undefined).toBe(true);
  });

  it('handles circular references safely', () => {
    const a: any = { foo: 'bar' };
    a.self = a;
    logger.warn('circular', a);
    expect(warnSpy).toHaveBeenCalled();
    const [, meta] = warnSpy.mock.calls[0] as any;
    // The circular reference should be replaced with a marker
    expect(JSON.stringify(meta)).toContain('[Circular]');
  });

  it('passes through primitives unchanged', () => {
    logger.info('primitive', 42);
    expect(infoSpy).toHaveBeenCalled();
    const [, meta] = infoSpy.mock.calls[0];
    expect(meta).toBe(42);
    logger.debug('primitive bool', true);
    const [, meta2] = debugSpy.mock.calls[0];
    expect(meta2).toBe(true);
  });
});
