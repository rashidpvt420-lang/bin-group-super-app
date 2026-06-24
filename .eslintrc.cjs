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
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    // Production gate policy:
    // TypeScript noEmit is the source-of-truth for TS symbol safety.
    // ESLint core no-undef is not TypeScript-aware enough for this mixed Vite/Firebase app.
    'no-undef': 'off',
    // TypeScript noEmit is also the source-of-truth for unused symbol safety.
    // ESLint unused-var reporting was creating non-blocking yellow warnings across staged/preview modules.
    '@typescript-eslint/no-unused-vars': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    'prefer-const': 'off',
  },
};
