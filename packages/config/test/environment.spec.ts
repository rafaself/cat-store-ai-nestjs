import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '../src/environment.js';
import { loadMailpitConfig, loadQueueConfig } from '../src/jobs.js';
import { loadBedrockConfig } from '../src/bedrock.js';

describe('Bedrock credentials', () => {
  it('loads explicit credentials and normalizes empty values', () => {
    expect(
      loadBedrockConfig({
        AWS_REGION: 'us-west-2',
        AWS_BEARER_TOKEN_BEDROCK: '  bearer-example  ',
        AWS_ACCESS_KEY_ID: '  access-example  ',
        AWS_SECRET_ACCESS_KEY: '  secret-example  ',
        AWS_SESSION_TOKEN: '  session-example  ',
      }),
    ).toMatchObject({
      region: 'us-west-2',
      bearerToken: 'bearer-example',
      accessKeyId: 'access-example',
      secretAccessKey: 'secret-example',
      sessionToken: 'session-example',
    });
    expect(
      loadBedrockConfig({ AWS_ACCESS_KEY_ID: ' ', AWS_SESSION_TOKEN: '' }),
    ).toMatchObject({
      accessKeyId: undefined,
      secretAccessKey: undefined,
      sessionToken: undefined,
    });
  });
});

describe('job infrastructure configuration', () => {
  it('uses local defaults and rejects invalid endpoints', () => {
    expect(loadQueueConfig({})).toEqual({ host: '127.0.0.1', port: 16379 });
    expect(loadMailpitConfig({})).toEqual({ url: 'http://127.0.0.1:18025' });
    expect(() => loadQueueConfig({ REDIS_PORT: '70000' })).toThrow(
      'Invalid environment configuration',
    );
    expect(() =>
      loadMailpitConfig({ MAILPIT_URL: 'file:///tmp/mail' }),
    ).toThrow('Invalid environment configuration');
  });
});

describe('validateEnvironment', () => {
  const workflowKey = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

  it('uses Bedrock and local database defaults with a workflow encryption key', () => {
    expect(
      validateEnvironment({ WORKFLOWS_ENCRYPTION_KEY: workflowKey }),
    ).toEqual({
      api: { environment: 'development', port: 3000 },
      logger: {
        json: false,
        logLevels: ['debug', 'log', 'warn', 'error', 'fatal'],
      },
      auth: { demoCustomerToken: undefined, supportApprovalToken: undefined },
      bedrock: {
        region: 'us-east-1',
        bearerToken: undefined,
        accessKeyId: undefined,
        secretAccessKey: undefined,
        sessionToken: undefined,
        modelId: 'us.openai.gpt-6-luna',
        embeddingModelId: 'amazon.titan-embed-text-v2:0',
        defaults: {
          timeout: '60s',
          retry: { attempts: 2 },
          maxOutputTokens: 800,
        },
        embeddingDefaults: { timeout: '30s', retry: { attempts: 3 } },
      },
      database: {
        connectionString:
          'postgresql://chatbot:chatbot@127.0.0.1:15432/chatbot',
        max: 10,
        connectionTimeoutMillis: 5_000,
      },
      workflows: {
        encryptionKey: workflowKey,
        worker: { concurrency: 4, pollInterval: '1s' },
        retry: { attempts: 2, backoff: { delay: 250, jitter: 'none' } },
      },
    });
  });

  it('normalizes an empty Bedrock token', () => {
    expect(
      validateEnvironment({
        AWS_BEARER_TOKEN_BEDROCK: '  ',
        WORKFLOWS_ENCRYPTION_KEY: workflowKey,
      }),
    ).toMatchObject({
      bedrock: { region: 'us-east-1', bearerToken: undefined },
      api: { environment: 'development', port: 3000 },
    });
  });

  it('accepts the configured Bedrock runtime region', () => {
    expect(
      validateEnvironment({
        AWS_REGION: 'us-west-2',
        WORKFLOWS_ENCRYPTION_KEY: workflowKey,
      }).bedrock.region,
    ).toBe('us-west-2');
  });

  it('rejects an invalid port', () => {
    expect(() =>
      validateEnvironment({
        PORT: '70000',
        WORKFLOWS_ENCRYPTION_KEY: workflowKey,
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('requires a valid workflow encryption key and distinct demo tokens', () => {
    expect(() =>
      validateEnvironment({ WORKFLOWS_ENCRYPTION_KEY: 'not-a-key' }),
    ).toThrow('Invalid environment configuration');
    expect(() =>
      validateEnvironment({
        WORKFLOWS_ENCRYPTION_KEY: workflowKey,
        DEMO_CUSTOMER_TOKEN: 'same-token',
        SUPPORT_APPROVAL_TOKEN: 'same-token',
      }),
    ).toThrow('Invalid environment configuration');
  });
});
