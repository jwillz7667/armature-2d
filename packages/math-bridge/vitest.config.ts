import { defineConfig } from 'vitest/config';

// The math-bridge suites (boundary schema validation, the forward-cascade + cumulative consistency
// checks, the mock engine determinism) are pure and run in the Node environment with no I/O beyond the
// committed scenario fixtures the mock reads.
export default defineConfig({
  test: {
    maxWorkers: 2,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
