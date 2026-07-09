/**
 * Tests for IP extraction utilities
 */


import { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/net/getClientIp';

describe('getClientIp', () => {
  let mockRequest: NextRequest;

  beforeEach(() => {
    // Create a mock NextRequest
    mockRequest = {
      headers: {
        get: vi.fn(),
      },
    } as unknown as NextRequest;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return client IP from x-client-ip header when trusted', () => {
    vi.mocked(mockRequest.headers.get).mockImplementation((name: string) => {
      if (name === 'x-client-ip') return '192.168.1.100';
      return null;
    });

    const result = getClientIp(mockRequest, { trustProxy: true });
    expect(result).toBe('192.168.1.100');
  });

  it('should return CF-Connecting-IP when available', () => {
    vi.mocked(mockRequest.headers.get).mockImplementation((name: string) => {
      if (name === 'cf-connecting-ip') return '203.0.113.195';
      return null;
    });

    const result = getClientIp(mockRequest, { trustProxy: true });
    expect(result).toBe('203.0.113.195');
  });

  it('should return X-Real-IP when available', () => {
    vi.mocked(mockRequest.headers.get).mockImplementation((name: string) => {
      if (name === 'x-real-ip') return '198.51.100.42';
      return null;
    });

    const result = getClientIp(mockRequest, { trustProxy: true });
    expect(result).toBe('198.51.100.42');
  });

  it('should return first IP from X-Forwarded-For when available', () => {
    vi.mocked(mockRequest.headers.get).mockImplementation((name: string) => {
      if (name === 'x-forwarded-for') return '203.0.113.195, 198.51.100.22, 192.0.2.1';
      return null;
    });

    const result = getClientIp(mockRequest, { trustProxy: true });
    expect(result).toBe('203.0.113.195');
  });

  it('should return unknown when no headers are available and not trusted', () => {
    vi.mocked(mockRequest.headers.get).mockReturnValue(null);

    const result = getClientIp(mockRequest, { trustProxy: false });
    expect(result).toBe('unknown');
  });

  it('should return unknown when no headers are available', () => {
    vi.mocked(mockRequest.headers.get).mockReturnValue(null);

    const result = getClientIp(mockRequest, { trustProxy: true });
    expect(result).toBe('unknown');
  });

  it('should trim whitespace from IP addresses', () => {
    vi.mocked(mockRequest.headers.get).mockImplementation((name: string) => {
      if (name === 'x-forwarded-for') return ' 203.0.113.195 ';
      return null;
    });

    const result = getClientIp(mockRequest, { trustProxy: true });
    expect(result).toBe('203.0.113.195');
  });

  it('should ignore malformed proxy values', () => {
    vi.mocked(mockRequest.headers.get).mockImplementation((name: string) => {
      if (name === 'x-client-ip') return 'attacker-controlled-value';
      if (name === 'x-real-ip') return '198.51.100.42';
      return null;
    });

    expect(getClientIp(mockRequest, { trustProxy: true })).toBe('198.51.100.42');
  });

  it('should normalize IPv4-mapped IPv6 addresses', () => {
    vi.mocked(mockRequest.headers.get).mockImplementation((name: string) => (
      name === 'cf-connecting-ip' ? '::ffff:203.0.113.10' : null
    ));

    expect(getClientIp(mockRequest, { trustProxy: true })).toBe('203.0.113.10');
  });
});