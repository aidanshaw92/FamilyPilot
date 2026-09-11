import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    // Legacy enrichment tests share .data fixture files across suites.
    // Serialise files until those fixtures have independent temporary stores.
    fileParallelism: false,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup/vitest.setup.ts'],
  },
});
