/**
 * Performance Budget Configuration
 * Defines performance thresholds and automated checks
 */

import { z } from 'zod';

// Performance budget schema
export const performanceBudgetSchema = z.object({
  buildTime: z.object({
    max: z.number(), // milliseconds
    warning: z.number(),
  }),
  bundleSize: z.object({
    total: z.object({
      max: z.number(), // bytes
      warning: z.number(),
    }),
    individual: z.object({
      max: z.number(), // bytes per chunk
      warning: z.number(),
    }),
  }),
  coreWebVitals: z.object({
    lcp: z.object({
      good: z.number(), // milliseconds
      poor: z.number(),
    }),
    fid: z.object({
      good: z.number(), // milliseconds  
      poor: z.number(),
    }),
    cls: z.object({
      good: z.number(), // score
      poor: z.number(),
    }),
    inp: z.object({
      good: z.number(), // milliseconds
      poor: z.number(),
    }),
    ttfb: z.object({
      good: z.number(), // milliseconds
      poor: z.number(),
    }),
  }),
  assets: z.object({
    maxImageSize: z.number(), // bytes
    maxFontSize: z.number(), // bytes
    totalAssetSize: z.number(), // bytes
  }),
  dependencies: z.object({
    maxTotal: z.number(),
    maxProduction: z.number(),
  }),
});

export type PerformanceBudget = z.infer<typeof performanceBudgetSchema>;

// Default performance budget based on industry best practices
export const defaultPerformanceBudget: PerformanceBudget = {
  buildTime: {
    max: 180000, // 3 minutes
    warning: 120000, // 2 minutes
  },
  bundleSize: {
    total: {
      max: 2097152, // 2MB
      warning: 1048576, // 1MB
    },
    individual: {
      max: 524288, // 512KB
      warning: 262144, // 256KB
    },
  },
  coreWebVitals: {
    lcp: {
      good: 2500, // 2.5s
      poor: 4000, // 4s
    },
    fid: {
      good: 100, // 100ms
      poor: 300, // 300ms
    },
    cls: {
      good: 0.1, // 0.1 score
      poor: 0.25, // 0.25 score
    },
    inp: {
      good: 200, // 200ms
      poor: 500, // 500ms
    },
    ttfb: {
      good: 800, // 800ms
      poor: 1800, // 1.8s
    },
  },
  assets: {
    maxImageSize: 1048576, // 1MB per image
    maxFontSize: 131072, // 128KB per font
    totalAssetSize: 10485760, // 10MB total
  },
  dependencies: {
    maxTotal: 150,
    maxProduction: 50,
  },
};

// Performance budget validation
export class PerformanceBudgetValidator {
  private budget: PerformanceBudget;

  constructor(budget: PerformanceBudget = defaultPerformanceBudget) {
    this.budget = performanceBudgetSchema.parse(budget);
  }

  validateBuildTime(buildTime: number): { status: 'pass' | 'warning' | 'fail'; message: string } {
    if (buildTime <= this.budget.buildTime.warning) {
      return { status: 'pass', message: `Build time ${(buildTime / 1000).toFixed(2)}s is within budget` };
    } else if (buildTime <= this.budget.buildTime.max) {
      return { status: 'warning', message: `Build time ${(buildTime / 1000).toFixed(2)}s exceeds warning threshold` };
    } else {
      return { status: 'fail', message: `Build time ${(buildTime / 1000).toFixed(2)}s exceeds maximum allowed` };
    }
  }

  validateBundleSize(totalSize: number, chunks: Record<string, number>): {
    status: 'pass' | 'warning' | 'fail';
    message: string;
    details: Array<{ file: string; size: number; status: string }>;
  } {
    const chunkDetails = Object.entries(chunks).map(([file, size]) => ({
      file,
      size,
      status: size > this.budget.bundleSize.individual.max ? 'fail' :
              size > this.budget.bundleSize.individual.warning ? 'warning' : 'pass'
    }));

    const hasFailingChunks = chunkDetails.some(chunk => chunk.status === 'fail');
    const hasWarningChunks = chunkDetails.some(chunk => chunk.status === 'warning');

    let status: 'pass' | 'warning' | 'fail' = 'pass';
    let message = `Total bundle size ${this.formatBytes(totalSize)} is within budget`;

    if (totalSize > this.budget.bundleSize.total.max || hasFailingChunks) {
      status = 'fail';
      message = `Bundle size ${this.formatBytes(totalSize)} exceeds maximum allowed`;
    } else if (totalSize > this.budget.bundleSize.total.warning || hasWarningChunks) {
      status = 'warning';
      message = `Bundle size ${this.formatBytes(totalSize)} exceeds warning threshold`;
    }

    return { status, message, details: chunkDetails };
  }

  validateCoreWebVital(metric: string, value: number): { status: 'good' | 'needs-improvement' | 'poor'; message: string } {
    const thresholds = this.budget.coreWebVitals[metric as keyof typeof this.budget.coreWebVitals];
    if (!thresholds) {
      return { status: 'good', message: `Unknown metric: ${metric}` };
    }

    if (value <= thresholds.good) {
      return { status: 'good', message: `${metric.toUpperCase()} ${this.formatMetricValue(metric, value)} is good` };
    } else if (value <= thresholds.poor) {
      return { status: 'needs-improvement', message: `${metric.toUpperCase()} ${this.formatMetricValue(metric, value)} needs improvement` };
    } else {
      return { status: 'poor', message: `${metric.toUpperCase()} ${this.formatMetricValue(metric, value)} is poor` };
    }
  }

  validateDependencies(total: number, production: number): { status: 'pass' | 'warning' | 'fail'; message: string } {
    if (total > this.budget.dependencies.maxTotal || production > this.budget.dependencies.maxProduction) {
      return { 
        status: 'fail', 
        message: `Dependencies exceed limits: ${total}/${this.budget.dependencies.maxTotal} total, ${production}/${this.budget.dependencies.maxProduction} production` 
      };
    } else if (total > this.budget.dependencies.maxTotal * 0.8 || production > this.budget.dependencies.maxProduction * 0.8) {
      return { 
        status: 'warning', 
        message: `Dependencies approaching limits: ${total}/${this.budget.dependencies.maxTotal} total, ${production}/${this.budget.dependencies.maxProduction} production` 
      };
    } else {
      return { 
        status: 'pass', 
        message: `Dependencies within budget: ${total}/${this.budget.dependencies.maxTotal} total, ${production}/${this.budget.dependencies.maxProduction} production` 
      };
    }
  }

  generateBudgetReport(metrics: {
    buildTime: number;
    bundleSize: { total: number; chunks: Record<string, number> };
    dependencies: { total: number; production: number };
    coreWebVitals?: Record<string, number>;
  }): {
    overall: 'pass' | 'warning' | 'fail';
    results: {
      buildTime: { status: 'pass' | 'warning' | 'fail'; message: string };
      bundleSize: { status: 'pass' | 'warning' | 'fail'; message: string; details: Array<{ file: string; size: number; status: string }> };
      dependencies: { status: 'pass' | 'warning' | 'fail'; message: string };
      coreWebVitals?: Record<string, { status: 'good' | 'needs-improvement' | 'poor'; message: string }>;
    };
    summary: string;
  } {
    const results: {
      buildTime: { status: 'pass' | 'warning' | 'fail'; message: string };
      bundleSize: { status: 'pass' | 'warning' | 'fail'; message: string; details: Array<{ file: string; size: number; status: string }> };
      dependencies: { status: 'pass' | 'warning' | 'fail'; message: string };
      coreWebVitals?: Record<string, { status: 'good' | 'needs-improvement' | 'poor'; message: string }>;
    } = {
      buildTime: this.validateBuildTime(metrics.buildTime),
      bundleSize: this.validateBundleSize(metrics.bundleSize.total, metrics.bundleSize.chunks),
      dependencies: this.validateDependencies(metrics.dependencies.total, metrics.dependencies.production),
    };
    let hasFailures = false;
    let hasWarnings = false;

    // Validate build time
    if (results.buildTime.status === 'fail') hasFailures = true;
    if (results.buildTime.status === 'warning') hasWarnings = true;

    // Validate bundle size
    if (results.bundleSize.status === 'fail') hasFailures = true;
    if (results.bundleSize.status === 'warning') hasWarnings = true;

    // Validate dependencies
    if (results.dependencies.status === 'fail') hasFailures = true;
    if (results.dependencies.status === 'warning') hasWarnings = true;

    // Validate Core Web Vitals if provided
    if (metrics.coreWebVitals) {
      results.coreWebVitals = {};
      for (const [metric, value] of Object.entries(metrics.coreWebVitals)) {
        results.coreWebVitals[metric] = this.validateCoreWebVital(metric, value);
        if (results.coreWebVitals[metric].status === 'poor') hasFailures = true;
        if (results.coreWebVitals[metric].status === 'needs-improvement') hasWarnings = true;
      }
    }

    const overall = hasFailures ? 'fail' : hasWarnings ? 'warning' : 'pass';
    const summary = this.generateSummary(overall, results);

    return { overall, results, summary };
  }

  private generateSummary(overall: string, results: {
    buildTime: { status: 'pass' | 'warning' | 'fail'; message: string };
    bundleSize: { status: 'pass' | 'warning' | 'fail'; message: string; details: Array<{ file: string; size: number; status: string }> };
    dependencies: { status: 'pass' | 'warning' | 'fail'; message: string };
    coreWebVitals?: Record<string, { status: 'good' | 'needs-improvement' | 'poor'; message: string }>;
  }): string {
    const summaryLines: string[] = [];
    
    summaryLines.push(`Performance Budget Status: ${overall.toUpperCase()}`);
    summaryLines.push('');
    
    // Build time
    summaryLines.push(`Build Time: ${results.buildTime.status} - ${results.buildTime.message}`);
    
    // Bundle size
    summaryLines.push(`Bundle Size: ${results.bundleSize.status} - ${results.bundleSize.message}`);
  const bundleDetails = results.bundleSize.details;
    if (bundleDetails.some((d) => d.status !== 'pass')) {
      summaryLines.push('  Chunk Details:');
      bundleDetails.forEach((detail) => {
        if (detail.status !== 'pass') {
          summaryLines.push(`    ${detail.file}: ${this.formatBytes(detail.size)} (${detail.status})`);
        }
      });
    }
    
    // Dependencies
    summaryLines.push(`Dependencies: ${results.dependencies.status} - ${results.dependencies.message}`);
    
    // Core Web Vitals
    if (results.coreWebVitals) {
      summaryLines.push('Core Web Vitals:');
      for (const [metric, result] of Object.entries(results.coreWebVitals)) {
        summaryLines.push(`  ${metric.toUpperCase()}: ${result.status} - ${result.message}`);
      }
    }

    return summaryLines.join('\n');
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private formatMetricValue(metric: string, value: number): string {
    switch (metric) {
      case 'cls':
        return value.toFixed(3);
      case 'fid':
      case 'lcp':
      case 'inp':
      case 'ttfb':
        return `${Math.round(value)}ms`;
      default:
        return value.toString();
    }
  }
}