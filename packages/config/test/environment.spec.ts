import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '../src/environment.js';
import { loadMailpitConfig, loadQueueConfig } from '../src/jobs.js';
import { loadAiProviderConfig } from '../src/ai.js';

const bedrockEnvironment = {
  AWS_BEARER_TOKEN_BEDROCK: 'test-token',
};

describe('selected provider configuration', () => {
  it('normalizes Bedrock credentials, including empty optional credentials', () => {
    expect(
      loadAiProviderConfig(
        {
          ...bedrockEnvironment,
          AWS_REGION: 'us-west-2',
          AWS_BEARER_TOKEN_BEDROCK: ' bearer ',
          AWS_ACCESS_KEY_ID: ' access ',
          AWS_SECRET_ACCESS_KEY: ' secret ',
          AWS_SESSION_TOKEN: ' session ',
        },
        ['bedrock'],
      ).bedrock,
    ).toEqual({
      region: 'us-west-2',
      apiKey: 'bearer',
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      sessionToken: 'session',
    });
    expect(
      loadAiProviderConfig(
        {
          ...bedrockEnvironment,
          AWS_ACCESS_KEY_ID: ' ',
          AWS_SESSION_TOKEN: '',
        },
        ['bedrock'],
      ).bedrock,
    ).toMatchObject({
      accessKeyId: undefined,
      secretAccessKey: undefined,
      sessionToken: undefined,
    });
  });

  it('accepts complete SigV4 credentials when the bearer token is blank', () => {
    expect(
      loadAiProviderConfig(
        {
          ...bedrockEnvironment,
          AWS_BEARER_TOKEN_BEDROCK: ' ',
          AWS_ACCESS_KEY_ID: 'access',
          AWS_SECRET_ACCESS_KEY: 'secret',
        },
        ['bedrock'],
      ).bedrock,
    ).toMatchObject({
      apiKey: undefined,
      accessKeyId: 'access',
      secretAccessKey: 'secret',
    });
  });

  it.each([
    { AWS_BEARER_TOKEN_BEDROCK: undefined },
    { AWS_BEARER_TOKEN_BEDROCK: ' ' },
    { AWS_BEARER_TOKEN_BEDROCK: '', AWS_ACCESS_KEY_ID: 'access' },
    { AWS_BEARER_TOKEN_BEDROCK: '', AWS_SECRET_ACCESS_KEY: 'secret' },
  ])('rejects incomplete Bedrock authentication %#', (credentials) => {
    expect(() =>
      loadAiProviderConfig({ ...bedrockEnvironment, ...credentials }, [
        'bedrock',
      ]),
    ).toThrow('AWS_BEARER_TOKEN_BEDROCK');
  });

  it.each(['openai', 'anthropic'] as const)(
    'requires credentials for selected %s models',
    (provider) => {
      expect(() =>
        loadAiProviderConfig(
          {
            ...bedrockEnvironment,
          },
          [provider],
        ),
      ).toThrow(`${provider.toUpperCase()}_API_KEY`);
    },
  );

  it('loads conventional API keys only for selected providers and does not mutate input', () => {
    const env = Object.freeze({
      ANTHROPIC_API_KEY: ' anthropic-key ',
      OPENAI_API_KEY: ' openai-key ',
      AWS_REGION: '',
      AWS_BEARER_TOKEN_BEDROCK: '',
    });
    expect(loadAiProviderConfig(env, ['anthropic', 'openai'])).toEqual({
      bedrock: undefined,
      anthropic: { apiKey: 'anthropic-key' },
      openai: { apiKey: 'openai-key', baseURL: 'https://api.openai.com/v1' },
    });
    expect(env.OPENAI_API_KEY).toBe(' openai-key ');
  });

  it('validates the selected OpenAI endpoint', () => {
    expect(() =>
      loadAiProviderConfig(
        {
          OPENAI_API_KEY: 'key',
          OPENAI_BASE_URL: 'invalid',
        },
        ['openai'],
      ),
    ).toThrow('OPENAI_BASE_URL');
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

  it('uses local database defaults with a workflow encryption key', () => {
    expect(
      validateEnvironment({
        ...bedrockEnvironment,
        WORKFLOWS_ENCRYPTION_KEY: workflowKey,
      }),
    ).toEqual({
      api: { environment: 'development', port: 3000 },
      logger: {
        json: false,
        logLevels: ['debug', 'log', 'warn', 'error', 'fatal'],
      },
      auth: { demoCustomerToken: undefined, supportApprovalToken: undefined },
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

  it('rejects an invalid port', () => {
    expect(() =>
      validateEnvironment({
        ...bedrockEnvironment,
        PORT: '70000',
        WORKFLOWS_ENCRYPTION_KEY: workflowKey,
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('requires a valid workflow encryption key and distinct demo tokens', () => {
    expect(() =>
      validateEnvironment({
        ...bedrockEnvironment,
        WORKFLOWS_ENCRYPTION_KEY: 'not-a-key',
      }),
    ).toThrow('Invalid environment configuration');
    expect(() =>
      validateEnvironment({
        ...bedrockEnvironment,
        WORKFLOWS_ENCRYPTION_KEY: workflowKey,
        DEMO_CUSTOMER_TOKEN: 'same-token',
        SUPPORT_APPROVAL_TOKEN: 'same-token',
      }),
    ).toThrow('Invalid environment configuration');
  });
});
