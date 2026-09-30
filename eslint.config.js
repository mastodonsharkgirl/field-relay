import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser,
      globals: { document: 'readonly', URL: 'readonly', Blob: 'readonly', TextEncoder: 'readonly' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: { '@typescript-eslint/no-unused-vars': 'error' },
  },
];
