// admin-panel/jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/index.tsx', // Entry point
    '!src/reportWebVitals.ts',
    '!src/react-app-env.d.ts',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/build/'],
  testMatch: ['**/__tests__/**/*.test.tsx'],
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  verbose: true,
};
