#!/usr/bin/env tsx

/**
 * Performance Optimization Suite
 * Comprehensive performance analysis and optimization toolkit
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { performance } from 'perf_hooks';

interface PerformanceMetrics {
  buildTime: number;
  bundleSize: {
    total: number;
    gzipped: number;
    chunks: Record<string, number>;
  };
  dependencies: {
    production: number;
    development: number;
    total: number;
  };
  assetOptimization: {
    images: number;
    fonts: number;
    scripts: number;
    styles: number;
  };
}

interface OptimizationRecommendation {
  category: 'bundle' | 'dependency' | 'asset' | 'code' | 'configuration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  action: string;
  estimatedSavings?: string;
  references?: string[];
}

class PerformanceOptimizer {
  private projectRoot: string;
  private buildDir: string;
  private metrics: PerformanceMetrics;
  private recommendations: OptimizationRecommendation[];

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.buildDir = path.join(projectRoot, '.next');
    this.metrics = {
      buildTime: 0,
      bundleSize: { total: 0, gzipped: 0, chunks: {} },
      dependencies: { production: 0, development: 0, total: 0 },
      assetOptimization: { images: 0, fonts: 0, scripts: 0, styles: 0 },
    };
    this.recommendations = [];
  }

  async analyze(): Promise<void> {
    console.log('🔍 Starting comprehensive performance analysis...\n');

    await this.analyzeBuildTime();
    await this.analyzeBundleSize();
    await this.analyzeDependencies();
    await this.analyzeAssets();
    await this.generateRecommendations();
    await this.generateReport();
  }

  private async analyzeBuildTime(): Promise<void> {
    console.log('⏱️  Analyzing build performance...');
    
    const startTime = performance.now();
    
    try {
      // Run build with timing
      const buildOutput = execSync('npm run build', { 
        cwd: this.projectRoot,
        encoding: 'utf8',
        timeout: 300000 // 5 minutes timeout
      });

      this.metrics.buildTime = performance.now() - startTime;
      
      // Extract Next.js build metrics if available
      const buildTimeMatch = buildOutput.match(/Done in ([\d.]+)s/);
      if (buildTimeMatch) {
        this.metrics.buildTime = parseFloat(buildTimeMatch[1]) * 1000;
      }

      console.log(`   Build completed in ${(this.metrics.buildTime / 1000).toFixed(2)}s`);
    } catch (error) {
      console.warn('   Build analysis failed:', error);
    }
  }

  private async analyzeBundleSize(): Promise<void> {
    console.log('📦 Analyzing bundle size...');

    try {
      const staticDir = path.join(this.buildDir, 'static');

      // Analyze main bundles
      if (await this.pathExists(staticDir)) {
        const chunks = await this.getChunkSizes(staticDir);
        this.metrics.bundleSize.chunks = chunks;
        this.metrics.bundleSize.total = Object.values(chunks).reduce((sum, size) => sum + size, 0);
      }

      // Estimate gzipped size (approximation)
      this.metrics.bundleSize.gzipped = Math.round(this.metrics.bundleSize.total * 0.3);

      console.log(`   Total bundle size: ${this.formatBytes(this.metrics.bundleSize.total)}`);
      console.log(`   Estimated gzipped: ${this.formatBytes(this.metrics.bundleSize.gzipped)}`);
    } catch (error) {
      console.warn('   Bundle size analysis failed:', error);
    }
  }

  private async getChunkSizes(staticDir: string): Promise<Record<string, number>> {
    const chunks: Record<string, number> = {};
    
    try {
      const chunksDir = path.join(staticDir, 'chunks');
      if (await this.pathExists(chunksDir)) {
        const files = await fs.readdir(chunksDir, { recursive: true });
        
        for (const file of files) {
          if (typeof file === 'string' && file.endsWith('.js')) {
            const filePath = path.join(chunksDir, file);
            const stats = await fs.stat(filePath);
            chunks[file] = stats.size;
          }
        }
      }
    } catch {
      console.warn('Failed to analyze chunks');
    }

    return chunks;
  }

  private async analyzeDependencies(): Promise<void> {
    console.log('📋 Analyzing dependencies...');

    try {
      const packageJsonPath = path.join(this.projectRoot, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

      this.metrics.dependencies.production = Object.keys(packageJson.dependencies || {}).length;
      this.metrics.dependencies.development = Object.keys(packageJson.devDependencies || {}).length;
      this.metrics.dependencies.total = this.metrics.dependencies.production + this.metrics.dependencies.development;

      console.log(`   Production dependencies: ${this.metrics.dependencies.production}`);
      console.log(`   Development dependencies: ${this.metrics.dependencies.development}`);
      console.log(`   Total dependencies: ${this.metrics.dependencies.total}`);
    } catch (error) {
      console.warn('   Dependency analysis failed:', error);
    }
  }

  private async analyzeAssets(): Promise<void> {
    console.log('🖼️  Analyzing assets...');

    try {
      const publicDir = path.join(this.projectRoot, 'public');
      const srcDir = path.join(this.projectRoot, 'src');

      // Count and size different asset types
      const assetCounts = await this.countAssetsByType([publicDir, srcDir]);
      this.metrics.assetOptimization = assetCounts;

      console.log(`   Images: ${assetCounts.images}`);
      console.log(`   Fonts: ${assetCounts.fonts}`);
      console.log(`   Scripts: ${assetCounts.scripts}`);
      console.log(`   Styles: ${assetCounts.styles}`);
    } catch (error) {
      console.warn('   Asset analysis failed:', error);
    }
  }

  private async countAssetsByType(directories: string[]): Promise<{
    images: number;
    fonts: number;
    scripts: number;
    styles: number;
  }> {
    const counts = { images: 0, fonts: 0, scripts: 0, styles: 0 };
    
    for (const dir of directories) {
      if (await this.pathExists(dir)) {
        await this.walkDirectory(dir, (filePath) => {
          const ext = path.extname(filePath).toLowerCase();
          
          if (['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.ico'].includes(ext)) {
            counts.images++;
          } else if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) {
            counts.fonts++;
          } else if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
            counts.scripts++;
          } else if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
            counts.styles++;
          }
        });
      }
    }

    return counts;
  }

  private async walkDirectory(dir: string, callback: (filePath: string) => void): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await this.walkDirectory(fullPath, callback);
        } else if (entry.isFile()) {
          callback(fullPath);
        }
      }
    } catch {
      // Ignore permission errors and missing directories
    }
  }

  private async generateRecommendations(): Promise<void> {
    console.log('💡 Generating optimization recommendations...');

    // Bundle size recommendations
    if (this.metrics.bundleSize.total > 1024 * 1024) { // > 1MB
      this.recommendations.push({
        category: 'bundle',
        severity: 'high',
        title: 'Large Bundle Size',
        description: `Total bundle size is ${this.formatBytes(this.metrics.bundleSize.total)}`,
        impact: 'Slower initial page loads, poor Core Web Vitals',
        action: 'Implement code splitting, tree shaking, and dynamic imports',
        estimatedSavings: '30-50% reduction in bundle size',
        references: [
          'https://nextjs.org/docs/advanced-features/dynamic-import',
          'https://webpack.js.org/guides/tree-shaking/'
        ]
      });
    }

    // Build time recommendations
    if (this.metrics.buildTime > 60000) { // > 1 minute
      this.recommendations.push({
        category: 'configuration',
        severity: 'medium',
        title: 'Slow Build Time',
        description: `Build takes ${(this.metrics.buildTime / 1000).toFixed(2)}s`,
        impact: 'Slower development cycles, increased CI/CD times',
        action: 'Enable Turbopack, optimize TypeScript config, use SWC',
        estimatedSavings: '50-80% faster builds',
        references: [
          'https://nextjs.org/docs/architecture/turbopack',
          'https://nextjs.org/docs/advanced-features/compiler'
        ]
      });
    }

    // Dependency recommendations
    if (this.metrics.dependencies.total > 100) {
      this.recommendations.push({
        category: 'dependency',
        severity: 'medium',
        title: 'High Dependency Count',
        description: `Project has ${this.metrics.dependencies.total} dependencies`,
        impact: 'Larger bundle sizes, security vulnerabilities, maintenance overhead',
        action: 'Audit and remove unused dependencies, consider lighter alternatives',
        estimatedSavings: '10-25% reduction in bundle size',
        references: [
          'https://docs.npmjs.com/cli/v8/commands/npm-audit',
          'https://bundlephobia.com/'
        ]
      });
    }

    // Asset optimization recommendations
    if (this.metrics.assetOptimization.images > 20) {
      this.recommendations.push({
        category: 'asset',
        severity: 'medium',
        title: 'Many Image Assets',
        description: `Project contains ${this.metrics.assetOptimization.images} images`,
        impact: 'Slower loading times, higher bandwidth usage',
        action: 'Implement next/image optimization, convert to WebP/AVIF, add lazy loading',
        estimatedSavings: '40-70% reduction in image sizes',
        references: [
          'https://nextjs.org/docs/api-reference/next/image',
          'https://web.dev/serve-images-webp/'
        ]
      });
    }

    // Performance monitoring recommendations
    this.recommendations.push({
      category: 'code',
      severity: 'low',
      title: 'Performance Monitoring',
      description: 'Implement comprehensive performance monitoring',
      impact: 'Better user experience insights, proactive optimization',
      action: 'Use Core Web Vitals monitoring, implement performance budgets',
      estimatedSavings: 'Ongoing performance improvements',
      references: [
        'https://web.dev/vitals/',
        'https://nextjs.org/docs/advanced-features/measuring-performance'
      ]
    });

    console.log(`   Generated ${this.recommendations.length} recommendations`);
  }

  private async generateReport(): Promise<void> {
    console.log('📊 Generating performance report...');

    const report = {
      timestamp: new Date().toISOString(),
      project: path.basename(this.projectRoot),
      metrics: this.metrics,
      recommendations: this.recommendations,
      summary: {
        totalIssues: this.recommendations.length,
        criticalIssues: this.recommendations.filter(r => r.severity === 'critical').length,
        highIssues: this.recommendations.filter(r => r.severity === 'high').length,
        mediumIssues: this.recommendations.filter(r => r.severity === 'medium').length,
        lowIssues: this.recommendations.filter(r => r.severity === 'low').length,
      }
    };

    // Save detailed JSON report
    const reportsDir = path.join(this.projectRoot, 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    
    const jsonReportPath = path.join(reportsDir, 'performance-analysis.json');
    await fs.writeFile(jsonReportPath, JSON.stringify(report, null, 2));

    // Generate human-readable summary
    const summaryPath = path.join(reportsDir, 'performance-summary.md');
    await this.generateMarkdownSummary(report, summaryPath);

    console.log(`\n✅ Performance analysis complete!`);
    console.log(`📄 Detailed report: ${jsonReportPath}`);
    console.log(`📋 Summary: ${summaryPath}`);
    
    // Print quick summary
    console.log('\n📈 Quick Summary:');
    console.log(`   Build Time: ${(this.metrics.buildTime / 1000).toFixed(2)}s`);
    console.log(`   Bundle Size: ${this.formatBytes(this.metrics.bundleSize.total)}`);
    console.log(`   Dependencies: ${this.metrics.dependencies.total}`);
    console.log(`   Recommendations: ${report.summary.totalIssues} (${report.summary.criticalIssues} critical, ${report.summary.highIssues} high)`);
  }

  private async generateMarkdownSummary(report: { timestamp: string; project: string; metrics: PerformanceMetrics; recommendations: OptimizationRecommendation[] }, filePath: string): Promise<void> {
    const content = `# Performance Analysis Report

**Generated:** ${new Date(report.timestamp).toLocaleString()}
**Project:** ${report.project}

## Executive Summary

- **Build Time:** ${(report.metrics.buildTime / 1000).toFixed(2)}s
- **Bundle Size:** ${this.formatBytes(report.metrics.bundleSize.total)} (${this.formatBytes(report.metrics.bundleSize.gzipped)} gzipped)
- **Dependencies:** ${report.metrics.dependencies.total} (${report.metrics.dependencies.production} production)
- **Assets:** ${report.metrics.assetOptimization.images} images, ${report.metrics.assetOptimization.fonts} fonts

## Performance Metrics

### Bundle Analysis
- **Total Size:** ${this.formatBytes(report.metrics.bundleSize.total)}
- **Gzipped Size:** ${this.formatBytes(report.metrics.bundleSize.gzipped)}
- **Compression Ratio:** ${((1 - report.metrics.bundleSize.gzipped / report.metrics.bundleSize.total) * 100).toFixed(1)}%

### Dependencies
- **Production:** ${report.metrics.dependencies.production}
- **Development:** ${report.metrics.dependencies.development}
- **Total:** ${report.metrics.dependencies.total}

### Assets
- **Images:** ${report.metrics.assetOptimization.images}
- **Fonts:** ${report.metrics.assetOptimization.fonts}
- **Scripts:** ${report.metrics.assetOptimization.scripts}
- **Styles:** ${report.metrics.assetOptimization.styles}

## Recommendations

${report.recommendations.map((rec: OptimizationRecommendation) => `
### ${rec.title} (${rec.severity.toUpperCase()})

**Category:** ${rec.category}
**Impact:** ${rec.impact}
**Action:** ${rec.action}
${rec.estimatedSavings ? `**Estimated Savings:** ${rec.estimatedSavings}` : ''}

${rec.description}

${rec.references ? rec.references.map((ref: string) => `- [Reference](${ref})`).join('\n') : ''}
`).join('\n')}

## Next Steps

1. Address critical and high-severity issues first
2. Implement performance monitoring
3. Set up performance budgets
4. Schedule regular performance audits
5. Monitor Core Web Vitals in production

---
*Report generated by Performance Optimization Suite*
`;

    await fs.writeFile(filePath, content);
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// CLI execution
if (require.main === module) {
  const optimizer = new PerformanceOptimizer();
  optimizer.analyze().catch(console.error);
}

export { PerformanceOptimizer, type PerformanceMetrics, type OptimizationRecommendation };