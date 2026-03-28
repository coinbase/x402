import js from '@eslint/js'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        RequestInfo: 'readonly',
        URL: 'readonly',
        RequestInit: 'readonly',
        Response: 'readonly',
        TextEncoder: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': ts,
    },
    rules: {
      ...ts.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
      'no-unused-vars': ['error', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
      'no-console': 'off', // Allow console in this package since it's for examples and debugging
      'no-undef': 'off' // Turn off no-undef since we have TypeScript checking
    },
  },
  js.configs.recommended,
]