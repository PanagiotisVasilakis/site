import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import internalFetchRule from "./scripts/eslint-rules/internal-fetch.js";

const eslintConfig = [
  { ignores: ["**/node_modules/**", "**/.next/**", "**/coverage/**", "out/**", "build/**", "next-env.d.ts", "**/reports/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off'
    }
  },
  {
    plugins: {
      'internal-fetch': {
        rules: {
          'no-internal-fetch': internalFetchRule
        }
      }
    },
    rules: { 'internal-fetch/no-internal-fetch': 'warn' }
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@next/next/no-img-element': 'off'
    }
  }
];

export default eslintConfig;
