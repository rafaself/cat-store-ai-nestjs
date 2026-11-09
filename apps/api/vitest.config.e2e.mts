import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: process.cwd(),
    include: ['apps/api/test/**/*.e2e-spec.ts'],
    environment: 'node',
  },
});
