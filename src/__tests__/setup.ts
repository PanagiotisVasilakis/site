/**
 * Jest Test Setup (Simplified)
 * Global setup for API testing environment
 */

// Basic test setup without Jest dependencies
console.log('🧪 Setting up API test environment...');

// Export test utilities
export const testUtils = {
  // Create mock response
  createMockResponse: (data: any, status = 200, headers = {}) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });
  },
  
  // Create mock request
  createMockRequest: (url: string, options: RequestInit = {}) => {
    return new Request(url, {
      method: 'GET',
      ...options,
    });
  },
  
  // Wait for async operations
  waitFor: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  
  // Generate random test data
  generateTestId: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  
  // Mock API responses
  mockApiResponse: (endpoint: string, response: any) => {
    console.log(`Mocking API response for ${endpoint}:`, response);
    return response;
  },
  
  // Validate response structure
  validateApiResponse: (response: any, expectedKeys: string[]) => {
    const errors: string[] = [];
    
    for (const key of expectedKeys) {
      if (!(key in response)) {
        errors.push(`Missing required key: ${key}`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  },
  
  // Performance measurement
  measurePerformance: async <T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> => {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    return { result, duration };
  },
};