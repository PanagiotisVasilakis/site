import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  { ignores: ["**/node_modules/**", "**/.next/**", "out/**", "build/**", "next-env.d.ts", "**/jscpd-report/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: { 'internal-fetch/no-internal-fetch': 'warn' }
  },
  // Test file specific overrides (relax strictness, allow mocks)
  {
    files: ['**/__tests__/**/*.{js,jsx,ts,tsx}', '**/*.test.{js,jsx,ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
      '@next/next/no-img-element': 'off',
      'jsx-a11y/alt-text': 'off'
    }
  },
  {
    plugins: {
      'internal-fetch': {
        rules: {
          'no-internal-fetch': (await import('./eslint-rules/internal-fetch.js')).default
        }
      }
    }
  }
];

export default eslintConfig;
