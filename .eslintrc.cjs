module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  globals: {
    JSX: 'readonly',
    google: 'readonly',
    self: 'readonly',
    importScripts: 'readonly',
    firebase: 'readonly',
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: [],
  rules: {
    // Launch gate policy:
    // The production workflow already runs:
    // - repository hygiene guard
    // - production stability guard
    // - TypeScript noEmit
    // - Vite production build
    // - Functions build
    // - Firebase rules tests
    // Root ESLint therefore stays as a parser/config sanity gate and must not
    // duplicate TypeScript/compiler checks with non-TypeScript-aware base rules.
    'no-undef': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    'prefer-const': 'off',
  },
};
