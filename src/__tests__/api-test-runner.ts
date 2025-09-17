/**
 * API Test Runner - Command Line Interface
 * Executes comprehensive API tests and generates detailed reports
 */

import { apiTestFramework } from './api-comprehensive.test';

interface TestConfig {
  baseUrl?: string;
  verbose?: boolean;
  performance?: boolean;
  security?: boolean;
  contract?: boolean;
  parallel?: boolean;
  timeout?: number;
}

class APITestRunner {
  private config: TestConfig;

  constructor(config: TestConfig = {}) {
    this.config = {
      baseUrl: 'http://localhost:3000',
      verbose: false,
      performance: true,
      security: true,
      contract: true,
      parallel: false,
      timeout: 30000,
      ...config,
    };
  }

  async run(): Promise<void> {
    console.log('🚀 Starting API Test Suite');
    console.log('================================');
    console.log(`Base URL: ${this.config.baseUrl}`);
    console.log(`Performance Tests: ${this.config.performance ? '✅' : '❌'}`);
    console.log(`Security Tests: ${this.config.security ? '✅' : '❌'}`);
    console.log(`Contract Tests: ${this.config.contract ? '✅' : '❌'}`);
    console.log('================================\n');

    try {
      const startTime = Date.now();
      
      // Run test suite
      const results = await apiTestFramework.runTestSuite();
      
      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      // Generate report
      this.generateReport(results, totalDuration);

      // Exit with appropriate code
      process.exit(results.passed ? 0 : 1);
    } catch (error) {
      console.error('❌ Test suite failed with error:');
      console.error(error);
      process.exit(1);
    }
  }

  private generateReport(results: any, duration: number): void {
    console.log('\n📊 TEST RESULTS');
    console.log('================');
    
    console.log(`\n🏃 Execution Summary:`);
    console.log(`• Total Duration: ${duration}ms`);
    console.log(`• Tests Passed: ${results.passedTests}/${results.totalTests}`);
    console.log(`• Success Rate: ${((results.passedTests / results.totalTests) * 100).toFixed(1)}%`);
    console.log(`• Overall Result: ${results.passed ? '✅ PASSED' : '❌ FAILED'}`);

    // Individual test results
    console.log(`\n🧪 Individual Tests:`);
    results.results.forEach((result: any) => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.name}`);
      
      if (!result.passed && result.errors) {
        result.errors.forEach((error: string) => {
          console.log(`   ⚠️  ${error}`);
        });
      }
      
      if (!result.passed && result.error) {
        console.log(`   ⚠️  ${result.error}`);
      }
    });

    // Performance results
    if (this.config.performance && results.performanceResults?.length > 0) {
      console.log(`\n⚡ Performance Results:`);
      results.performanceResults.forEach((perf: any) => {
        console.log(`📈 ${perf.name}:`);
        console.log(`   • Average: ${perf.average.toFixed(2)}ms`);
        console.log(`   • Min/Max: ${perf.min.toFixed(2)}ms / ${perf.max.toFixed(2)}ms`);
        console.log(`   • Success Rate: ${perf.successRate.toFixed(1)}%`);
        console.log(`   • Iterations: ${perf.iterations}`);
      });
    }

    // Security results
    if (this.config.security && results.securityResults?.length > 0) {
      console.log(`\n🔒 Security Results:`);
      results.securityResults.forEach((security: any) => {
        const status = security.passed ? '✅' : '❌';
        console.log(`${status} ${security.endpoint} (${security.method})`);
        
        if (security.vulnerabilities.length > 0) {
          security.vulnerabilities.forEach((vuln: string) => {
            console.log(`   🚨 ${vuln}`);
          });
        }
        
        console.log(`   • Tests Run: ${security.tests.length}`);
        console.log(`   • Blocked: ${security.tests.filter((t: any) => t.blocked).length}`);
      });
    }

    // Recommendations
    this.generateRecommendations(results);
  }

  private generateRecommendations(results: any): void {
    console.log(`\n💡 Recommendations:`);
    
    if (!results.passed) {
      console.log(`🔧 Fix failing tests before deployment`);
    }

    // Performance recommendations
    const slowTests = results.performanceResults?.filter((p: any) => p.average > 1000) || [];
    if (slowTests.length > 0) {
      console.log(`⚡ Consider optimizing slow endpoints (>${1000}ms):`);
      slowTests.forEach((test: any) => {
        console.log(`   • ${test.name}: ${test.average.toFixed(2)}ms`);
      });
    }

    // Security recommendations
    const securityIssues = results.securityResults?.filter((s: any) => !s.passed) || [];
    if (securityIssues.length > 0) {
      console.log(`🔒 Address security vulnerabilities:`);
      securityIssues.forEach((issue: any) => {
        console.log(`   • ${issue.endpoint}: ${issue.vulnerabilities.join(', ')}`);
      });
    }

    // General recommendations
    console.log(`📋 General:`);
    console.log(`   • Run tests in CI/CD pipeline`);
    console.log(`   • Monitor API performance in production`);
    console.log(`   • Update tests when adding new endpoints`);
    console.log(`   • Review security headers regularly`);
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const config: TestConfig = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--base-url':
        config.baseUrl = args[++i];
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--no-performance':
        config.performance = false;
        break;
      case '--no-security':
        config.security = false;
        break;
      case '--no-contract':
        config.contract = false;
        break;
      case '--parallel':
        config.parallel = true;
        break;
      case '--timeout':
        config.timeout = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log(`
API Test Runner

Usage: npm run test:api [options]

Options:
  --base-url <url>     Base URL for testing (default: http://localhost:3000)
  --verbose            Enable verbose output
  --no-performance     Skip performance tests
  --no-security        Skip security tests  
  --no-contract        Skip contract validation tests
  --parallel           Run tests in parallel
  --timeout <ms>       Test timeout in milliseconds (default: 30000)
  --help               Show this help message

Examples:
  npm run test:api
  npm run test:api -- --base-url http://localhost:4000
  npm run test:api -- --no-security --verbose
        `);
        process.exit(0);
        break;
    }
  }

  const runner = new APITestRunner(config);
  runner.run().catch(console.error);
}

export default APITestRunner;