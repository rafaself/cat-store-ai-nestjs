import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    // Suites share the database and queue; their fake-model workers must not compete.
    fileParallelism: false,
    root: process.cwd(),
    include: ['apps/api/test/**/*.e2e-spec.ts'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      AWS_REGION: process.env.AWS_REGION ?? 'us-east-1',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://chatbot:chatbot@127.0.0.1:15432/chatbot_test',
      REDIS_HOST: process.env.REDIS_HOST ?? '127.0.0.1',
      REDIS_PORT: process.env.REDIS_PORT ?? '16379',
      MAILPIT_URL: process.env.MAILPIT_URL ?? 'http://127.0.0.1:18025',
      DEMO_CUSTOMER_TOKEN: 'test-customer-token',
      SUPPORT_APPROVAL_TOKEN: 'test-support-token',
      WORKFLOWS_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    },
  },
});
