module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'bin-group-super-app/',
    'apps/**/public/firebase-messaging-sw.js',
    'public/firebase-messaging-sw.js',
    'functions/lib/',
    'scripts/',
    'scratch/',
    '*.js',
    '*.cjs',
    '*.mjs',
    'audit*.js',
    'copy_script.js',
    'diag.js',
    'fetch_proof.js',
    'fix_auth.js',
    'fix_lang.js',
    'patch-routes.js',
    'production_repair_runner.js',
    'qa-*.js',
    'repair_technician_feed.js',
    'rest_*.js',
    'translate.js'
  ],
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
    // TypeScript noEmit is the source-of-truth for type safety.
    // Keep lint focused on source errors and ignore utility scripts/service workers.
    '@typescript-eslint/no-unused-vars': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    'prefer-const': 'off',
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
    },
    {
      files: ['**/firebase-messaging-sw.js'],
      env: { serviceworker: true, browser: true, es2022: true },
      globals: {
        firebase: 'readonly',
        importScripts: 'readonly',
      },
      rules: {
        'no-restricted-globals': 'off',
        'no-undef': 'off',
      },
    },
  ],
};
