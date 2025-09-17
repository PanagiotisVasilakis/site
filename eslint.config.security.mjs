import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import security from 'eslint-plugin-security';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
});

const config = [
  ...compat.extends('next/core-web-vitals'),
  {
    plugins: {
      security
    },
    rules: {
      // Security-focused rules
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-object-injection': 'warn',
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'error',

      // Additional security-related rules
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      
      // React security rules
      'react/no-danger': 'error',
      'react/no-danger-with-children': 'error',
      
      // Next.js security rules
      '@next/next/no-script-component-in-head': 'error',
      '@next/next/no-css-tags': 'error',
      '@next/next/no-styled-jsx-in-document': 'error',
      '@next/next/no-sync-scripts': 'error',
      '@next/next/no-title-in-document-head': 'error',

      // Prevent common vulnerabilities
      'no-console': 'warn', // Prevent information leakage
      'no-debugger': 'error', // Remove debug statements
      'no-alert': 'error' // Prevent XSS via alert dialogs
    }
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      // Relax security rules for test files
      'security/detect-non-literal-fs-filename': 'off',
      'no-console': 'off'
    }
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      // Relax some rules for build scripts
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-child-process': 'off',
      'no-console': 'off'
    }
  }
];

export default config;