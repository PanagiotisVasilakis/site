/**
 * Performance Testing Suite
 * Automated performance testing and Core Web Vitals validation
 */

import { PerformanceBudgetValidator, defaultPerformanceBudget } from '@/lib/performanceBudget';

interface PerformanceMetrics {
  lcp: number;
  fid: number;
  cls: number;
  inp: number;
  ttfb: number;
  fcp: number;
}

interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  id: string;
}

// Mock Web Vitals data for testing
const mockWebVitalsData = {
  good: {
    lcp: 2000,
    fid: 80,
    cls: 0.05,
    inp: 150,
    ttfb: 600,
    fcp: 1500,
  },
  needsImprovement: {
    lcp: 3000,
    fid: 200,
    cls: 0.15,
    inp: 350,
    ttfb: 1200,
    fcp: 2200,
  },
  poor: {
    lcp: 5000,
    fid: 400,
    cls: 0.35,
    inp: 600,
    ttfb: 2000,
    fcp: 3500,
  },
};

class PerformanceTester {
  private budgetValidator: PerformanceBudgetValidator;

  constructor() {
    this.budgetValidator = new PerformanceBudgetValidator(defaultPerformanceBudget);
  }

  validatePerformanceBudget(metrics: PerformanceMetrics): {
    passed: boolean;
    results: Record<string, any>;
    summary: string;
  } {
    const mockBuildMetrics = {
      buildTime: 60000, // 1 minute
      bundleSize: {
        // Keep total under warning threshold and chunks under individual warning to ensure overall 'pass'
        total: 600 * 1024, // ~600KB
        chunks: {
          'main.js': 255 * 1024, // below 256KB warning threshold
          'vendor.js': 256 * 1024, // equal to warning threshold is allowed (not >)
          'runtime.js': 64 * 1024,
        },
      },
      dependencies: {
        total: 75,
        production: 25,
      },
      coreWebVitals: {
        lcp: metrics.lcp,
        fid: metrics.fid,
        cls: metrics.cls,
        inp: metrics.inp,
        ttfb: metrics.ttfb,
        fcp: metrics.fcp,
      } as Record<string, number>,
    };

    const report = this.budgetValidator.generateBudgetReport(mockBuildMetrics);
    
    return {
      passed: report.overall === 'pass',
      results: report.results,
      summary: report.summary,
    };
  }

  analyzeBundlePerformance(bundleSize: number, chunks: Record<string, number>): {
    status: 'pass' | 'warning' | 'fail';
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    let status: 'pass' | 'warning' | 'fail' = 'pass';

    // Check total bundle size
    if (bundleSize > 2 * 1024 * 1024) { // 2MB
      status = 'fail';
      recommendations.push('Bundle size exceeds 2MB limit. Consider code splitting and tree shaking.');
    } else if (bundleSize > 1024 * 1024) { // 1MB
      status = 'warning';
      recommendations.push('Bundle size approaching 1MB. Monitor and optimize.');
    }

    // Check individual chunk sizes
    for (const [chunkName, size] of Object.entries(chunks)) {
      if (size > 512 * 1024) { // 512KB
        status = status === 'fail' ? 'fail' : 'warning';
        recommendations.push(`Chunk ${chunkName} is ${Math.round(size / 1024)}KB. Consider splitting.`);
      }
    }

    // Performance recommendations
    if (Object.keys(chunks).length > 10) {
      recommendations.push('High number of chunks may impact loading performance. Consider chunking strategy optimization.');
    }

    return { status, recommendations };
  }

  simulateNetworkConditions(baseMetrics: PerformanceMetrics, condition: 'fast' | 'slow' | 'offline'): PerformanceMetrics {
    const multipliers = {
      fast: { ttfb: 0.5, lcp: 0.8, fcp: 0.8 },
      slow: { ttfb: 3.0, lcp: 2.5, fcp: 2.0 },
      offline: { ttfb: 10.0, lcp: 10.0, fcp: 10.0 },
    };

    const multiplier = multipliers[condition];
    
    return {
      ...baseMetrics,
      ttfb: baseMetrics.ttfb * multiplier.ttfb,
      lcp: baseMetrics.lcp * multiplier.lcp,
      fcp: baseMetrics.fcp * multiplier.fcp,
    };
  }
}

describe('Performance Budget Validation', () => {
  it('should pass with good Core Web Vitals', () => {
    const tester = new PerformanceTester();
    const results = tester.validatePerformanceBudget(mockWebVitalsData.good);
    
    expect(results.passed).toBe(true);
    expect(results.results.coreWebVitals.lcp.status).toBe('good');
    expect(results.results.coreWebVitals.fid.status).toBe('good');
    expect(results.results.coreWebVitals.cls.status).toBe('good');
  });

  it('should warn with metrics needing improvement', () => {
    const tester = new PerformanceTester();
    const results = tester.validatePerformanceBudget(mockWebVitalsData.needsImprovement);
    
    expect(results.passed).toBe(false);
    expect(results.results.coreWebVitals.lcp.status).toBe('needs-improvement');
    expect(results.results.coreWebVitals.fid.status).toBe('needs-improvement');
  });

  it('should fail with poor Core Web Vitals', () => {
    const tester = new PerformanceTester();
    const results = tester.validatePerformanceBudget(mockWebVitalsData.poor);
    
    expect(results.passed).toBe(false);
    expect(results.results.coreWebVitals.lcp.status).toBe('poor');
    expect(results.results.coreWebVitals.fid.status).toBe('poor');
    expect(results.results.coreWebVitals.cls.status).toBe('poor');
  });
});

describe('Bundle Performance Analysis', () => {
  it('should pass with optimal bundle size', () => {
    const tester = new PerformanceTester();
    const bundleSize = 800 * 1024; // 800KB
    const chunks = {
      'main.js': 300 * 1024,
      'vendor.js': 250 * 1024,
      'runtime.js': 50 * 1024,
    };

    const results = tester.analyzeBundlePerformance(bundleSize, chunks);
    
    expect(results.status).toBe('pass');
    expect(results.recommendations).toHaveLength(0);
  });

  it('should warn with large bundle size', () => {
    const tester = new PerformanceTester();
    const bundleSize = 1.5 * 1024 * 1024; // 1.5MB
    const chunks = {
      'main.js': 600 * 1024,
      'vendor.js': 500 * 1024,
      'runtime.js': 100 * 1024,
    };

    const results = tester.analyzeBundlePerformance(bundleSize, chunks);
    
    expect(results.status).toBe('warning');
    expect(results.recommendations.length).toBeGreaterThan(0);
    expect(results.recommendations[0]).toContain('Bundle size approaching 1MB');
  });

  it('should fail with excessive bundle size', () => {
    const tester = new PerformanceTester();
    const bundleSize = 3 * 1024 * 1024; // 3MB
    const chunks = {
      'main.js': 1024 * 1024,
      'vendor.js': 1024 * 1024,
      'runtime.js': 500 * 1024,
    };

    const results = tester.analyzeBundlePerformance(bundleSize, chunks);
    
    expect(results.status).toBe('fail');
    expect(results.recommendations.length).toBeGreaterThan(0);
    expect(results.recommendations[0]).toContain('Bundle size exceeds 2MB limit');
  });

  it('should warn about large individual chunks', () => {
    const tester = new PerformanceTester();
    const bundleSize = 1024 * 1024; // 1MB total
    const chunks = {
      'main.js': 600 * 1024, // Large chunk
      'vendor.js': 300 * 1024,
      'runtime.js': 124 * 1024,
    };

    const results = tester.analyzeBundlePerformance(bundleSize, chunks);
    
    expect(results.status).toBe('warning');
    expect(results.recommendations.some(rec => rec.includes('main.js'))).toBe(true);
  });
});

describe('Network Condition Simulation', () => {
  it('should improve metrics on fast connections', () => {
    const tester = new PerformanceTester();
    const baseMetrics = mockWebVitalsData.needsImprovement;
    const fastMetrics = tester.simulateNetworkConditions(baseMetrics, 'fast');
    
    expect(fastMetrics.ttfb).toBeLessThan(baseMetrics.ttfb);
    expect(fastMetrics.lcp).toBeLessThan(baseMetrics.lcp);
    expect(fastMetrics.fcp).toBeLessThan(baseMetrics.fcp);
  });

  it('should degrade metrics on slow connections', () => {
    const tester = new PerformanceTester();
    const baseMetrics = mockWebVitalsData.good;
    const slowMetrics = tester.simulateNetworkConditions(baseMetrics, 'slow');
    
    expect(slowMetrics.ttfb).toBeGreaterThan(baseMetrics.ttfb);
    expect(slowMetrics.lcp).toBeGreaterThan(baseMetrics.lcp);
    expect(slowMetrics.fcp).toBeGreaterThan(baseMetrics.fcp);
  });

  it('should severely impact metrics offline', () => {
    const tester = new PerformanceTester();
    const baseMetrics = mockWebVitalsData.good;
    const offlineMetrics = tester.simulateNetworkConditions(baseMetrics, 'offline');
    
    expect(offlineMetrics.ttfb).toBeGreaterThan(baseMetrics.ttfb * 5);
    expect(offlineMetrics.lcp).toBeGreaterThan(baseMetrics.lcp * 5);
  });
});

describe('Performance Budget Validator', () => {
  it('should validate build time correctly', () => {
    const validator = new PerformanceBudgetValidator(defaultPerformanceBudget);
    const fastBuild = validator.validateBuildTime(30000); // 30s
    const slowBuild = validator.validateBuildTime(240000); // 4 minutes
    
    expect(fastBuild.status).toBe('pass');
    expect(slowBuild.status).toBe('fail');
  });

  it('should validate Core Web Vitals correctly', () => {
    const validator = new PerformanceBudgetValidator(defaultPerformanceBudget);
    const goodLCP = validator.validateCoreWebVital('lcp', 2000);
    const poorLCP = validator.validateCoreWebVital('lcp', 5000);
    
    expect(goodLCP.status).toBe('good');
    expect(poorLCP.status).toBe('poor');
  });

  it('should validate dependencies correctly', () => {
    const validator = new PerformanceBudgetValidator(defaultPerformanceBudget);
    const goodDeps = validator.validateDependencies(50, 20);
    const excessiveDeps = validator.validateDependencies(200, 80);
    
    expect(goodDeps.status).toBe('pass');
    expect(excessiveDeps.status).toBe('fail');
  });

  it('should generate comprehensive budget reports', () => {
    const validator = new PerformanceBudgetValidator(defaultPerformanceBudget);
    const metrics = {
      buildTime: 90000,
      // total > 1MB (warning), and main chunk between warning and max to avoid fail
      bundleSize: { total: 1500000, chunks: { 'main.js': 500000 } },
      dependencies: { total: 100, production: 40 },
      coreWebVitals: {
        lcp: mockWebVitalsData.needsImprovement.lcp,
        fid: mockWebVitalsData.needsImprovement.fid,
        cls: mockWebVitalsData.needsImprovement.cls,
        inp: mockWebVitalsData.needsImprovement.inp,
        ttfb: mockWebVitalsData.needsImprovement.ttfb,
      },
    };

    const report = validator.generateBudgetReport(metrics);
    
    expect(report.overall).toBe('warning');
    expect(report.results.buildTime).toBeDefined();
    expect(report.results.bundleSize).toBeDefined();
    expect(report.results.dependencies).toBeDefined();
    expect(report.results.coreWebVitals).toBeDefined();
    expect(report.summary).toContain('Performance Budget Status');
  });
});

export { PerformanceTester, type PerformanceMetrics, type WebVitalMetric };