/**
 * Jest Configuration for API Testing
 * Configures Jest for comprehensive API test execution
 */

interface JestConfig {
  preset?: string;
  testEnvironment?: string;
  testMatch?: string[];
  collectCoverage?: boolean;
  coverageDirectory?: string;
  coverageReporters?: string[];
  collectCoverageFrom?: string[];
  coverageThreshold?: {
    global?: {
      branches?: number;
      functions?: number;
      lines?: number;
      statements?: number;
    };
    [path: string]: {
      branches?: number;
      functions?: number;
      lines?: number;
      statements?: number;
    } | undefined;
  };
  moduleNameMapping?: Record<string, string>;
  setupFilesAfterEnv?: string[];
  transform?: Record<string, unknown>;
  moduleFileExtensions?: string[];
  testTimeout?: number;
  verbose?: boolean;
  clearMocks?: boolean;
  restoreMocks?: boolean;
  forceExit?: boolean;
  detectOpenHandles?: boolean;
  maxWorkers?: string;
  errorOnDeprecated?: boolean;
  globalSetup?: string;
  globalTeardown?: string;
  reporters?: Array<string | [string, unknown]>;
  watchman?: boolean;
  watchPathIgnorePatterns?: string[];
}

const config: JestConfig = {
  // Basic configuration
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test patterns
  testMatch: [
    '<rootDir>/src/__tests__/**/*.test.ts',
    '<rootDir>/src/**/*.test.ts',
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/__tests__/**/*',
    '!src/**/node_modules/**',
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/app/api/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/lib/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  
  // Module resolution
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  
  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Maximum worker processes
  maxWorkers: '50%',
  
  // Error on deprecated features
  errorOnDeprecated: true,
  
  // Global setup and teardown
  globalSetup: '<rootDir>/src/__tests__/global-setup.ts',
  globalTeardown: '<rootDir>/src/__tests__/global-teardown.ts',
  
  // Test reporter configuration
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './coverage/html-report',
      filename: 'test-report.html',
      expand: true,
      hideIcon: false,
      pageTitle: 'API Test Report',
      logoImgPath: undefined,
      includeFailureMsg: true,
      enableMergeData: true,
      dataMergeLevel: 1,
    }],
    ['jest-junit', {
      outputDirectory: './coverage',
      outputName: 'junit.xml',
      suiteName: 'API Tests',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true,
    }],
  ],
  
  // Watch mode configuration
  watchman: true,
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/.next/',
    '<rootDir>/public/',
  ],
};

export default config;