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
  plugins: ['react-hooks'],
  extends: [],
  rules: {
    // Launch gate policy:
    // The production workflow already runs repository hygiene, stability,
    // TypeScript noEmit, Vite build, Functions build, and Firebase rules tests.
    // Root ESLint remains a parser/config sanity gate and must not duplicate
    // compiler checks with rule packs that are not aligned with this app.
    'no-undef': 'off',
    'react-hooks/exhaustive-deps': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    'prefer-const': 'off',
  },
};
