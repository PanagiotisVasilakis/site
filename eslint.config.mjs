import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import security from "eslint-plugin-security";
import internalFetchRule from "./scripts/eslint-rules/internal-fetch.js";

const eslintConfig = [
  { ignores: ["**/node_modules/**", "**/.next/**", "**/coverage/**", "out/**", "build/**", "dist/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    plugins: {
      security,
      'internal-fetch': {
        rules: {
          'no-internal-fetch': internalFetchRule
        }
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'internal-fetch/no-internal-fetch': 'warn',

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
      'no-debugger': 'error',

      // React security rules: report intentional inline bootstrap/structured-data sites for review.
      'react/no-danger': 'error',
      'react/no-danger-with-children': 'error',

      // Next.js security rules
      '@next/next/no-script-component-in-head': 'error',
      '@next/next/no-css-tags': 'error',
      '@next/next/no-styled-jsx-in-document': 'error',
      '@next/next/no-sync-scripts': 'error',
      '@next/next/no-title-in-document-head': 'error'
    }
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@next/next/no-img-element': 'off',
      'security/detect-non-literal-fs-filename': 'off'
    }
  },
  {
    files: ['scripts/**/*.{js,mjs,ts}'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off'
    }
  },
  {
    // Reviewed script sinks: JSON-LD is script-termination escaped and the theme
    // bootstrap is a constant nonce-protected payload.
    files: [
      'src/app/\\[locale\\]/page.tsx',
      'src/app/layout.tsx',
      'src/components/guide/GuideDetail.tsx',
    ],
    rules: { 'react/no-danger': 'off' }
  },
  {
    // Reviewed filesystem sinks: inputs are constant allowlists or are validated
    // and resolved beneath a fixed private root before use.
    files: ['src/lib/data.ts'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' }
  },
  {
    // Deliberate hostile input: the test feeds a javascript: failure link to
    // PortalRefreshRedirect and asserts that it falls back to the site root.
    files: ['tests/components/portal-refresh-redirect.test.tsx'],
    rules: { 'no-script-url': 'off' }
  }
];

export default eslintConfig;
