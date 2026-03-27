// backend/jest.config.js
module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js', // Entry point
    '!src/data/**', // Mock data
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
  verbose: true,
  testTimeout: 10000,
};
