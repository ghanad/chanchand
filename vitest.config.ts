import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // The runner integration tests hit the network (14 targets per run) and
    // comfortably exceed the 5s default when the suite runs in parallel.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
