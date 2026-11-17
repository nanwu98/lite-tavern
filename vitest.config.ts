import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Worker threads instead of forked processes: they start faster and work in
    // confined environments where spawning child processes is not permitted.
    pool: 'threads',
  },
});
