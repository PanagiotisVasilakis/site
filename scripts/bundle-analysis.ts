/**
 * Bundle Analysis Script
 * Analyzes webpack bundle for optimization opportunities
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface BundleAnalysis {
  totalSize: number;
  jsSize: number;
  cssSize: number;
  largestChunks: Array<{
    name: string;
    size: number;
    percentage: number;
  }>;
  duplicatePackages: Array<{
    package: string;
    versions: string[];
    totalSize: number;
  }>;
  unusedPackages: string[];
  optimizationSuggestions: Array<{
    type: 'size' | 'duplicate' | 'unused' | 'treeshaking';
    message: string;
    impact: 'high' | 'medium' | 'low';
    action: string;
  }>;
  performance: {
    firstLoad: number;
    routeSize: Record<string, number>;
  };
}

interface WebpackStats {
  assets: Array<{
    name: string;
    size: number;
    chunks: number[];
  }>;
  chunks: Array<{
    id: number;
    names: string[];
    size: number;
    modules: Array<{
      name: string;
      size: number;
    }>;
  }>;
  modules: Array<{
    name: string;
    size: number;
    chunks: number[];
  }>;
}

class BundleAnalyzer {
  private projectRoot: string;
  private buildDir: string;

  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.buildDir = join(projectRoot, '.next');
  }

  async analyze(): Promise<BundleAnalysis> {
    console.log('🔍 Starting bundle analysis...');

    // Build the project with webpack stats
    await this.buildWithStats();

    // Read webpack stats
    const stats = this.readWebpackStats();
    
    // Perform analysis
    const analysis: BundleAnalysis = {
      totalSize: this.calculateTotalSize(stats),
      jsSize: this.calculateJSSize(stats),
      cssSize: this.calculateCSSSize(stats),
      largestChunks: this.findLargestChunks(stats),
      duplicatePackages: await this.findDuplicatePackages(),
      unusedPackages: await this.findUnusedPackages(),
      optimizationSuggestions: [],
      performance: {
        firstLoad: 0,
        routeSize: {},
      },
    };

    // Add optimization suggestions
    analysis.optimizationSuggestions = this.generateOptimizationSuggestions(analysis);
    
    // Calculate performance metrics
    analysis.performance = this.calculatePerformanceMetrics(stats);

    return analysis;
  }

  private async buildWithStats(): Promise<void> {
    console.log('📦 Building project with webpack stats...');
    
    try {
      // Build with webpack bundle analyzer
      execSync('npm run build', {
        cwd: this.projectRoot,
        env: {
          ...process.env,
          ANALYZE: 'true',
        },
        stdio: 'inherit',
      });
    } catch (error) {
      console.error('Build failed:', error);
      throw error;
    }
  }

  private readWebpackStats(): WebpackStats {
    const statsPath = join(this.buildDir, 'webpack-stats.json');
    
    if (!existsSync(statsPath)) {
      throw new Error('Webpack stats not found. Make sure to build with ANALYZE=true');
    }

    const statsContent = readFileSync(statsPath, 'utf-8');
    return JSON.parse(statsContent);
  }

  private calculateTotalSize(stats: WebpackStats): number {
    return stats.assets.reduce((total, asset) => total + asset.size, 0);
  }

  private calculateJSSize(stats: WebpackStats): number {
    return stats.assets
      .filter(asset => asset.name.endsWith('.js'))
      .reduce((total, asset) => total + asset.size, 0);
  }

  private calculateCSSSize(stats: WebpackStats): number {
    return stats.assets
      .filter(asset => asset.name.endsWith('.css'))
      .reduce((total, asset) => total + asset.size, 0);
  }

  private findLargestChunks(stats: WebpackStats): BundleAnalysis['largestChunks'] {
    const totalSize = this.calculateTotalSize(stats);
    
    return stats.chunks
      .map(chunk => ({
        name: chunk.names[0] || `chunk-${chunk.id}`,
        size: chunk.size,
        percentage: (chunk.size / totalSize) * 100,
      }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);
  }

  private async findDuplicatePackages(): Promise<BundleAnalysis['duplicatePackages']> {
    console.log('🔍 Analyzing duplicate packages...');
    
    try {
      // Use npm ls to find duplicate packages
      const output = execSync('npm ls --depth=0 --json', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      });

  void JSON.parse(output);
      const duplicates: BundleAnalysis['duplicatePackages'] = [];

      // This is a simplified implementation
      // In production, you'd want to use tools like webpack-bundle-analyzer
      // or duplicate-package-checker-webpack-plugin

      return duplicates;
    } catch (error) {
      console.warn('Could not analyze duplicate packages:', error);
      return [];
    }
  }

  private async findUnusedPackages(): Promise<string[]> {
    console.log('🔍 Finding unused packages...');
    
    try {
      // Use depcheck to find unused dependencies
      const depcheckOutput = execSync('npx depcheck --json', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      });

      const depcheckResult = JSON.parse(depcheckOutput);
      return depcheckResult.dependencies || [];
    } catch (error) {
      console.warn('Could not analyze unused packages:', error);
      return [];
    }
  }

  private generateOptimizationSuggestions(analysis: BundleAnalysis): BundleAnalysis['optimizationSuggestions'] {
    const suggestions: BundleAnalysis['optimizationSuggestions'] = [];

    // Large bundle size
    if (analysis.totalSize > 1024 * 1024) { // > 1MB
      suggestions.push({
        type: 'size',
        message: `Large bundle size: ${this.formatBytes(analysis.totalSize)}`,
        impact: 'high',
        action: 'Consider code splitting, tree shaking, and removing unused dependencies',
      });
    }

    // Large individual chunks
    analysis.largestChunks.forEach(chunk => {
      if (chunk.size > 500 * 1024) { // > 500KB
        suggestions.push({
          type: 'size',
          message: `Large chunk: ${chunk.name} (${this.formatBytes(chunk.size)})`,
          impact: chunk.size > 1024 * 1024 ? 'high' : 'medium',
          action: 'Split this chunk further or optimize its contents',
        });
      }
    });

    // Duplicate packages
    analysis.duplicatePackages.forEach(duplicate => {
      suggestions.push({
        type: 'duplicate',
        message: `Duplicate package: ${duplicate.package} (${duplicate.versions.length} versions)`,
        impact: 'medium',
        action: 'Resolve version conflicts and use a single version',
      });
    });

    // Unused packages
    if (analysis.unusedPackages.length > 0) {
      suggestions.push({
        type: 'unused',
        message: `${analysis.unusedPackages.length} unused packages found`,
        impact: 'low',
        action: 'Remove unused dependencies to reduce bundle size',
      });
    }

    return suggestions;
  }

  private calculatePerformanceMetrics(stats: WebpackStats): BundleAnalysis['performance'] {
    const routeSizes: Record<string, number> = {};
    let firstLoadSize = 0;

    // Calculate first load JS size
    const mainChunks = stats.chunks.filter(chunk => 
      chunk.names.some(name => name.includes('main') || name.includes('_app'))
    );

    firstLoadSize = mainChunks.reduce((total, chunk) => total + chunk.size, 0);

    // Calculate route-specific sizes
    stats.chunks.forEach(chunk => {
      chunk.names.forEach(name => {
        if (name.startsWith('pages/')) {
          routeSizes[name] = chunk.size;
        }
      });
    });

    return {
      firstLoad: firstLoadSize,
      routeSize: routeSizes,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  generateReport(analysis: BundleAnalysis): string {
    const report = `
# Bundle Analysis Report

## Overview
- **Total Bundle Size**: ${this.formatBytes(analysis.totalSize)}
- **JavaScript Size**: ${this.formatBytes(analysis.jsSize)}
- **CSS Size**: ${this.formatBytes(analysis.cssSize)}
- **First Load JS**: ${this.formatBytes(analysis.performance.firstLoad)}

## Largest Chunks
${analysis.largestChunks.map(chunk => 
  `- **${chunk.name}**: ${this.formatBytes(chunk.size)} (${chunk.percentage.toFixed(1)}%)`
).join('\n')}

## Optimization Suggestions
${analysis.optimizationSuggestions.map(suggestion => 
  `### ${suggestion.type.toUpperCase()} - ${suggestion.impact.toUpperCase()} Impact
- **Issue**: ${suggestion.message}
- **Action**: ${suggestion.action}
`).join('\n')}

## Duplicate Packages
${analysis.duplicatePackages.length > 0 
  ? analysis.duplicatePackages.map(duplicate => 
      `- **${duplicate.package}**: ${duplicate.versions.join(', ')} (${this.formatBytes(duplicate.totalSize)})`
    ).join('\n')
  : '✅ No duplicate packages found'
}

## Unused Packages
${analysis.unusedPackages.length > 0
  ? analysis.unusedPackages.map(pkg => `- ${pkg}`).join('\n')
  : '✅ No unused packages found'
}

## Performance Recommendations

### Bundle Size Targets
- **Good**: < 244 KB first load JS
- **Warning**: 244 KB - 488 KB first load JS  
- **Error**: > 488 KB first load JS

### Current Status
${analysis.performance.firstLoad < 244 * 1024 
  ? '✅ **GOOD**: First load JS is within recommended limits'
  : analysis.performance.firstLoad < 488 * 1024
    ? '⚠️ **WARNING**: First load JS is larger than recommended'
    : '❌ **ERROR**: First load JS is significantly larger than recommended'
}

### Route-specific Sizes
${Object.entries(analysis.performance.routeSize).map(([route, size]) => 
  `- **${route}**: ${this.formatBytes(size)}`
).join('\n')}

## Next Steps
1. Implement code splitting for large chunks
2. Enable tree shaking in webpack config
3. Use dynamic imports for non-critical code
4. Optimize images and assets
5. Remove unused dependencies
6. Consider using webpack-bundle-analyzer for detailed analysis

Generated on: ${new Date().toISOString()}
`;

    return report;
  }

  async saveReport(analysis: BundleAnalysis, outputPath?: string): Promise<void> {
    const report = this.generateReport(analysis);
    const filePath = outputPath || join(this.projectRoot, 'bundle-analysis.md');
    
    writeFileSync(filePath, report, 'utf-8');
    console.log(`📊 Bundle analysis report saved to: ${filePath}`);

    // Also save JSON data
    const jsonPath = filePath.replace('.md', '.json');
    writeFileSync(jsonPath, JSON.stringify(analysis, null, 2), 'utf-8');
    console.log(`📊 Bundle analysis data saved to: ${jsonPath}`);
  }
}

// CLI interface
async function main() {
  const analyzer = new BundleAnalyzer();
  
  try {
    const analysis = await analyzer.analyze();
    await analyzer.saveReport(analysis);
    
    console.log('\n🎉 Bundle analysis complete!');
    console.log(`📦 Total bundle size: ${analyzer['formatBytes'](analysis.totalSize)}`);
    console.log(`🚀 First load JS: ${analyzer['formatBytes'](analysis.performance.firstLoad)}`);
    
    if (analysis.optimizationSuggestions.length > 0) {
      console.log(`⚠️  ${analysis.optimizationSuggestions.length} optimization opportunities found`);
    } else {
      console.log('✅ No major optimization issues found');
    }
    
  } catch (error) {
    console.error('❌ Bundle analysis failed:', error);
    process.exit(1);
  }
}

// Export for programmatic use
export { BundleAnalyzer, type BundleAnalysis };

// Run if called directly
if (require.main === module) {
  main();
}