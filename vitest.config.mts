import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: process.cwd(),
    include: ['apps/**/*.spec.ts', 'packages/**/*.spec.ts'],
    environment: 'node',
  },
});
