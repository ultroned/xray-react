import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';

export default [
  {
    ignores: [
      'build/**',
      'node_modules/**',
      '*.min.js',
      '*.config.js',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      strict: ['error', 'global'],
      'no-extra-boolean-cast': 'off',
      'no-use-before-define': 'error',
      'no-unused-vars': 'error',
      'no-undef': 'error',
      'no-console': 'off',
      'no-prototype-builtins': 'off',
      'import/no-unresolved': 'error',
      'import/no-duplicates': 'error',
    },
  },
];
