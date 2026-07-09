import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import security from 'eslint-plugin-security';

const config = [
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/coverage/**', 'out/**', 'build/**', 'next-env.d.ts', '**/reports/**'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
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
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'warn',

      // Additional security-related rules
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'warn',
      
      // React security rules: report intentional inline bootstrap/structured-data sites for review.
      'react/no-danger': 'warn',
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
      'no-alert': 'warn', // Browser dialogs should be reviewed, not treated as code execution.
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off'
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