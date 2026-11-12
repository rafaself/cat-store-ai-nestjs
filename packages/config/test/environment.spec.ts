import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '../src/environment.js';
import { loadMailpitConfig, loadQueueConfig } from '../src/jobs.js';
import { loadBedrockConfig } from '../src/bedrock.js';

describe.each([
  { prefix: 'BEDROCK_MODEL_', registry: 'models' },
  { prefix: 'BEDROCK_EMBEDDING_MODEL_', registry: 'embeddingModels' },
] as const)('Bedrock $registry registry', ({ prefix, registry }) => {
  const otherRegistry =
    registry === 'models'
      ? { BEDROCK_EMBEDDING_MODEL_DEFAULT: 'other-model' }
      : { BEDROCK_MODEL_DEFAULT: 'other-model' };
  const defaultVariable = `${prefix}DEFAULT`;

  it('discovers named models, trims IDs, isolates registries, and leaves the environment unchanged', () => {
    const environment: Readonly<NodeJS.ProcessEnv> = Object.freeze({
      ...otherRegistry,
      [defaultVariable]: ' default-model ',
      [`${prefix}FAST`]: 'fast-model',
      [`${prefix}FAST_REASONING`]: ' reasoning-model ',
      [`${prefix}BATCH2`]: 'batch-model',
      UNRELATED_SETTING: 'ignored',
      AWS_REGION: 'us-west-2',
    });
    const config = loadBedrockConfig(environment);
    expect(config[registry]).toEqual({
      default: 'default-model',
      fast: 'fast-model',
      fast_reasoning: 'reasoning-model',
      batch2: 'batch-model',
    });
    expect(
      config[registry === 'models' ? 'embeddingModels' : 'models'],
    ).toEqual({ default: 'other-model' });
    expect(environment[defaultVariable]).toBe(' default-model ');
  });

  it.each([
    {},
    { [`${prefix}FAST`]: 'fast-model' },
    { [defaultVariable]: undefined },
    { [defaultVariable]: '' },
    { [defaultVariable]: '  ' },
  ])('requires an explicit nonblank default model %#', (environment) => {
    expect(() =>
      loadBedrockConfig({ ...otherRegistry, ...environment }),
    ).toThrow(defaultVariable);
  });

  it.each(['', ' ', undefined])(
    'rejects blank or undefined additional model IDs (%s)',
    (modelId) => {
      expect(() =>
        loadBedrockConfig({
          ...otherRegistry,
          [defaultVariable]: 'default-model',
          [`${prefix}FAST`]: modelId,
        }),
      ).toThrow(`${prefix}FAST`);
    },
  );

  it.each(['', 'fast', 'FAST-NAME', '1FAST', '__PROTO__', 'DEFAULT_extra'])(
    'rejects malformed model suffixes (%s)',
    (suffix) => {
      expect(() =>
        loadBedrockConfig({
          ...otherRegistry,
          [defaultVariable]: 'default-model',
          [`${prefix}${suffix}`]: 'model',
        }),
      ).toThrow('Invalid environment configuration');
    },
  );
});

describe('Bedrock credentials', () => {
  it('loads explicit credentials and normalizes empty values', () => {
    expect(
      loadBedrockConfig({
        BEDROCK_MODEL_DEFAULT: 'test-model',
        BEDROCK_EMBEDDING_MODEL_DEFAULT: 'test-embedding',
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
      loadBedrockConfig({
        BEDROCK_MODEL_DEFAULT: 'test-model',
        BEDROCK_EMBEDDING_MODEL_DEFAULT: 'test-embedding',
        AWS_ACCESS_KEY_ID: ' ',
        AWS_SESSION_TOKEN: '',
      }),
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

  it('uses the required Bedrock model and local database defaults with a workflow encryption key', () => {
    expect(
      validateEnvironment({
        BEDROCK_MODEL_DEFAULT: 'test-model',
        BEDROCK_EMBEDDING_MODEL_DEFAULT: 'test-embedding',
        WORKFLOWS_ENCRYPTION_KEY: workflowKey,
      }),
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
        models: { default: 'test-model' },
        embeddingModels: { default: 'test-embedding' },
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
        BEDROCK_MODEL_DEFAULT: 'test-model',
        BEDROCK_EMBEDDING_MODEL_DEFAULT: 'test-embedding',
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
        BEDROCK_MODEL_DEFAULT: 'test-model',
        BEDROCK_EMBEDDING_MODEL_DEFAULT: 'test-embedding',
        AWS_REGION: 'us-west-2',
        WORKFLOWS_ENCRYPTION_KEY: workflowKey,
      }).bedrock.region,
    ).toBe('us-west-2');
  });

  it('rejects an invalid port', () => {
    expect(() =>
      validateEnvironment({
        BEDROCK_MODEL_DEFAULT: 'test-model',
        BEDROCK_EMBEDDING_MODEL_DEFAULT: 'test-embedding',
        PORT: '70000',
        WORKFLOWS_ENCRYPTION_KEY: workflowKey,
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('requires a valid workflow encryption key and distinct demo tokens', () => {
    expect(() =>
      validateEnvironment({
        BEDROCK_MODEL_DEFAULT: 'test-model',
        BEDROCK_EMBEDDING_MODEL_DEFAULT: 'test-embedding',
        WORKFLOWS_ENCRYPTION_KEY: 'not-a-key',
      }),
    ).toThrow('Invalid environment configuration');
    expect(() =>
      validateEnvironment({
        BEDROCK_MODEL_DEFAULT: 'test-model',
        BEDROCK_EMBEDDING_MODEL_DEFAULT: 'test-embedding',
        WORKFLOWS_ENCRYPTION_KEY: workflowKey,
        DEMO_CUSTOMER_TOKEN: 'same-token',
        SUPPORT_APPROVAL_TOKEN: 'same-token',
      }),
    ).toThrow('Invalid environment configuration');
  });
});
