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
      'security/detect-non-literal-fs-filename': 'error',
      'security/detect-non-literal-regexp': 'error',
      'security/detect-non-literal-require': 'error',
      // This heuristic flags ordinary typed property access and drowns out actionable findings.
      // Boundary validation and TypeScript remain enforced; high-risk dynamic access is reviewed directly.
      'security/detect-object-injection': 'off',
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'error',

      // Additional security-related rules
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      
      // React security rules: report intentional inline bootstrap/structured-data sites for review.
      'react/no-danger': 'error',
      'react/no-danger-with-children': 'error',
      
      // Next.js security rules
      '@next/next/no-script-component-in-head': 'error',
      '@next/next/no-css-tags': 'error',
      '@next/next/no-styled-jsx-in-document': 'error',
      '@next/next/no-sync-scripts': 'error',
      '@next/next/no-title-in-document-head': 'error',

      // Prevent common vulnerabilities
      // Logging and type-style policy are owned by the primary lint config. Duplicating
      // them here produced hundreds of non-security warnings and a false-green gate.
      'no-console': 'off',
      'no-debugger': 'error', // Remove debug statements
      'no-alert': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off'
    }
  },
  {
    files: ['scripts/**/*.{js,mjs,ts}'],
    rules: {
      // Relax some rules for build scripts
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-child-process': 'off',
      'no-console': 'off'
    }
  },
  {
    // Reviewed script sinks: JSON-LD is script-termination escaped and the theme
    // bootstrap is a constant nonce-protected payload.
    files: [
      'src/app/\\[locale\\]/page.tsx',
      'src/app/\\[locale\\]/\\[category\\]/\\[slug\\]/page.tsx',
      'src/app/layout.tsx',
      'src/components/moments/MomentsDetailLayout.tsx',
    ],
    rules: { 'react/no-danger': 'off' }
  },
  {
    // Reviewed filesystem sinks: inputs are constant allowlists or are validated
    // and resolved beneath a fixed private root before use.
    files: ['src/app/api/health/route.ts', 'src/lib/data.ts'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' }
  },
  {
    // Inputs are length-capped before these linear IP-format expressions run.
    files: ['src/lib/net/getClientIp.ts'],
    rules: { 'security/detect-unsafe-regex': 'off' }
  }
];

export default config;
