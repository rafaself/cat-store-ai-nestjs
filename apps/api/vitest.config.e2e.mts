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
    env: {
      NODE_ENV: 'test',
      AWS_REGION: process.env.AWS_REGION ?? 'us-east-1',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://chatbot:chatbot@127.0.0.1:15432/chatbot_test',
      DEMO_CUSTOMER_TOKEN: 'test-customer-token',
      SUPPORT_APPROVAL_TOKEN: 'test-support-token',
      WORKFLOWS_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    },
  },
});
