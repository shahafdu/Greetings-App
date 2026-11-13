import { defineConfig } from 'vitest/config';

// Unit tests for the logic that has bitten us before: storage / App Lock, dates, share-file
// import and the AI proxy Worker. Run with `npm test`. They need no browser — Node provides
// WebCrypto and compression; tests/setup.ts supplies an in-memory localStorage.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
  },
});
