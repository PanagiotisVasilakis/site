/**
 * API Load Testing Suite
 * Performs load testing and stress testing on API endpoints
 */

import { performance } from 'perf_hooks';
import { MockData } from './api-comprehensive.test';

interface LoadTestConfig {
  baseUrl: string;
  concurrency: number;
  duration: number; // seconds
  rampUp: number; // seconds
  endpoints: LoadTestEndpoint[];
}

interface LoadTestEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  weight: number; // probability weight
  payload?: any;
  headers?: Record<string, string>;
}

interface LoadTestResult {
  endpoint: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  errors: ErrorSummary[];
}

interface ErrorSummary {
  status: number;
  message: string;
  count: number;
}

interface LoadTestSummary {
  totalDuration: number;
  totalRequests: number;
  totalSuccessful: number;
  totalFailed: number;
  overallRPS: number;
  averageResponseTime: number;
  results: LoadTestResult[];
}

class LoadTester {
  private config: LoadTestConfig;
  private isRunning = false;
  private startTime = 0;
  private results: Map<string, LoadTestResult> = new Map();

  constructor(config: LoadTestConfig) {
    this.config = config;
  }

  async runLoadTest(): Promise<LoadTestSummary> {
    console.log('🔥 Starting Load Test');
    console.log('====================');
    console.log(`Base URL: ${this.config.baseUrl}`);
    console.log(`Concurrency: ${this.config.concurrency} users`);
    console.log(`Duration: ${this.config.duration} seconds`);
    console.log(`Ramp-up: ${this.config.rampUp} seconds`);
    console.log(`Endpoints: ${this.config.endpoints.length}`);
    console.log('====================\n');

    this.isRunning = true;
    this.startTime = performance.now();
    this.results.clear();

    // Initialize results for each endpoint
    this.config.endpoints.forEach(endpoint => {
      this.results.set(`${endpoint.method} ${endpoint.path}`, {
        endpoint: `${endpoint.method} ${endpoint.path}`,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        requestsPerSecond: 0,
        errorRate: 0,
        errors: [],
      });
    });

    // Create user workers
    const workers: Promise<void>[] = [];
    const userRampUpDelay = (this.config.rampUp * 1000) / this.config.concurrency;

    for (let i = 0; i < this.config.concurrency; i++) {
      const delay = i * userRampUpDelay;
      workers.push(this.createUserWorker(delay));
    }

    // Set test duration timer
    setTimeout(() => {
      this.isRunning = false;
    }, this.config.duration * 1000);

    // Wait for all workers to complete
    await Promise.all(workers);

    return this.generateSummary();
  }

  private async createUserWorker(delay: number): Promise<void> {
    // Wait for ramp-up delay
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const responseTimes: Map<string, number[]> = new Map();

    // Initialize response times tracking
    this.config.endpoints.forEach(endpoint => {
      responseTimes.set(`${endpoint.method} ${endpoint.path}`, []);
    });

    while (this.isRunning) {
      try {
        // Select random endpoint based on weights
        const endpoint = this.selectRandomEndpoint();
        const key = `${endpoint.method} ${endpoint.path}`;

        const startTime = performance.now();

        // Make request
        const response = await this.makeRequest(endpoint);

        const endTime = performance.now();
        const responseTime = endTime - startTime;

        // Update results
        const result = this.results.get(key)!;
        result.totalRequests++;

        if (response.ok) {
          result.successfulRequests++;
        } else {
          result.failedRequests++;
          this.recordError(result, response.status, response.statusText);
        }

        // Track response time
        responseTimes.get(key)!.push(responseTime);
        result.minResponseTime = Math.min(result.minResponseTime, responseTime);
        result.maxResponseTime = Math.max(result.maxResponseTime, responseTime);

        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (error) {
        console.error('Worker error:', error);
      }
    }

    // Calculate averages
    this.updateAverages(responseTimes);
  }

  private selectRandomEndpoint(): LoadTestEndpoint {
    const totalWeight = this.config.endpoints.reduce((sum, ep) => sum + ep.weight, 0);
    let random = Math.random() * totalWeight;

    for (const endpoint of this.config.endpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        return endpoint;
      }
    }

    return this.config.endpoints[0]; // fallback
  }

  private async makeRequest(endpoint: LoadTestEndpoint): Promise<Response> {
    const url = `${this.config.baseUrl}${endpoint.path}`;

    const options: RequestInit = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        ...endpoint.headers,
      },
    };

    if (endpoint.payload) {
      options.body = JSON.stringify(endpoint.payload);
    }

    return fetch(url, options);
  }

  private recordError(result: LoadTestResult, status: number, message: string): void {
    const existingError = result.errors.find(e => e.status === status);
    if (existingError) {
      existingError.count++;
    } else {
      result.errors.push({ status, message, count: 1 });
    }
  }

  private updateAverages(responseTimes: Map<string, number[]>): void {
    const duration = (performance.now() - this.startTime) / 1000;

    for (const [key, times] of responseTimes) {
      const result = this.results.get(key)!;

      if (times.length > 0) {
        result.averageResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
      }

      result.requestsPerSecond = result.totalRequests / duration;
      result.errorRate = (result.failedRequests / result.totalRequests) * 100;
    }
  }

  private generateSummary(): LoadTestSummary {
    const endTime = performance.now();
    const totalDuration = (endTime - this.startTime) / 1000;

    const results = Array.from(this.results.values());
    const totalRequests = results.reduce((sum, r) => sum + r.totalRequests, 0);
    const totalSuccessful = results.reduce((sum, r) => sum + r.successfulRequests, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failedRequests, 0);

    const overallRPS = totalRequests / totalDuration;
    const averageResponseTime = results.reduce((sum, r) => sum + r.averageResponseTime, 0) / results.length;

    console.log('\n📊 LOAD TEST RESULTS');
    console.log('=====================');
    console.log(`Total Duration: ${totalDuration.toFixed(2)}s`);
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Successful: ${totalSuccessful} (${((totalSuccessful / totalRequests) * 100).toFixed(1)}%)`);
    console.log(`Failed: ${totalFailed} (${((totalFailed / totalRequests) * 100).toFixed(1)}%)`);
    console.log(`Overall RPS: ${overallRPS.toFixed(2)}`);
    console.log(`Average Response Time: ${averageResponseTime.toFixed(2)}ms`);

    console.log('\n📈 Endpoint Results:');
    results.forEach(result => {
      console.log(`\n${result.endpoint}:`);
      console.log(`  • Requests: ${result.totalRequests}`);
      console.log(`  • Success Rate: ${((result.successfulRequests / result.totalRequests) * 100).toFixed(1)}%`);
      console.log(`  • RPS: ${result.requestsPerSecond.toFixed(2)}`);
      console.log(`  • Avg Response: ${result.averageResponseTime.toFixed(2)}ms`);
      console.log(`  • Min/Max: ${result.minResponseTime.toFixed(2)}ms / ${result.maxResponseTime.toFixed(2)}ms`);

      if (result.errors.length > 0) {
        console.log(`  • Errors:`);
        result.errors.forEach(error => {
          console.log(`    - ${error.status} ${error.message}: ${error.count} times`);
        });
      }
    });

    return {
      totalDuration,
      totalRequests,
      totalSuccessful,
      totalFailed,
      overallRPS,
      averageResponseTime,
      results,
    };
  }
}

// Predefined load test configurations
const LoadTestConfigs = {
  // Light load test
  light: {
    baseUrl: 'http://localhost:3000',
    concurrency: 5,
    duration: 30,
    rampUp: 10,
    endpoints: [
      { path: '/api/categories', method: 'GET' as const, weight: 10 },
      { path: '/api/analytics', method: 'GET' as const, weight: 5 },
      { path: '/api/vitals', method: 'GET' as const, weight: 3 },
      { path: '/api/security/dashboard', method: 'GET' as const, weight: 2 },
    ],
  },

  // Normal load test
  normal: {
    baseUrl: 'http://localhost:3000',
    concurrency: 20,
    duration: 60,
    rampUp: 20,
    endpoints: [
      { path: '/api/categories', method: 'GET' as const, weight: 15 },
      { path: '/api/categories/moments/items', method: 'GET' as const, weight: 10 },
      { path: '/api/analytics', method: 'GET' as const, weight: 8 },
      { path: '/api/analytics', method: 'POST' as const, weight: 5, payload: MockData.analyticsEvent },
      { path: '/api/vitals', method: 'GET' as const, weight: 5 },
      { path: '/api/vitals', method: 'POST' as const, weight: 3, payload: MockData.webVital },
      { path: '/api/security/dashboard', method: 'GET' as const, weight: 4 },
    ],
  },

  // Stress test
  stress: {
    baseUrl: 'http://localhost:3000',
    concurrency: 50,
    duration: 120,
    rampUp: 30,
    endpoints: [
      { path: '/api/categories', method: 'GET' as const, weight: 20 },
      { path: '/api/categories/moments/items', method: 'GET' as const, weight: 15 },
      { path: '/api/categories/hotels/items', method: 'GET' as const, weight: 15 },
      { path: '/api/analytics', method: 'GET' as const, weight: 10 },
      { path: '/api/analytics', method: 'POST' as const, weight: 8, payload: MockData.analyticsEvent },
      { path: '/api/vitals', method: 'GET' as const, weight: 8 },
      { path: '/api/vitals', method: 'POST' as const, weight: 6, payload: MockData.webVital },
      { path: '/api/security/dashboard', method: 'GET' as const, weight: 6 },
      { path: '/api/security/csp-report', method: 'POST' as const, weight: 2, payload: { 'document-uri': 'test', 'violated-directive': 'script-src' } },
    ],
  },
};

// CLI interface for load testing
if (require.main === module) {
  const testType = process.argv[2] || 'light';
  const config = LoadTestConfigs[testType as keyof typeof LoadTestConfigs];

  if (!config) {
    console.error(`Unknown test type: ${testType}`);
    console.log('Available types: light, normal, stress');
    process.exit(1);
  }

  const loadTester = new LoadTester(config);
  loadTester.runLoadTest().catch(console.error);
}

export { LoadTester, LoadTestConfigs };