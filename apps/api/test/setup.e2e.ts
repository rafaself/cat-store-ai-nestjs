process.env.NODE_ENV = 'test';
process.env.AWS_REGION ??= 'us-east-1';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://chatbot:chatbot@127.0.0.1:15432/chatbot_test';
process.env.DEMO_CUSTOMER_TOKEN = 'test-customer-token';
process.env.SUPPORT_APPROVAL_TOKEN = 'test-support-token';
process.env.WORKFLOWS_ENCRYPTION_KEY =
  'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
