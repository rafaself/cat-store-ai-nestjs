import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

vi.mock('@ai-sdk/amazon-bedrock', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ai-sdk/amazon-bedrock')>();
  return { ...actual, createAmazonBedrock: vi.fn(actual.createAmazonBedrock) };
});
vi.mock('@ai-sdk/anthropic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-sdk/anthropic')>();
  return { ...actual, createAnthropic: vi.fn(actual.createAnthropic) };
});
vi.mock('@ai-sdk/openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-sdk/openai')>();
  return { ...actual, createOpenAI: vi.fn(actual.createOpenAI) };
});

import {
  loadAiConfig,
  buildAiOptions,
  buildEmbeddingOptions,
} from './index.js';

const environment = {
  AWS_BEARER_TOKEN_BEDROCK: 'test-token',
};

beforeEach(() => vi.clearAllMocks());

describe('explicit AI model configuration', () => {
  it('uses versioned models and defaults regardless of model environment variables', () => {
    const config = loadAiConfig(
      Object.freeze({
        ...environment,
        AI_MODEL_DEFAULT: 'openai:unexpected',
        AI_EMBEDDING_MODEL_DEFAULT: 'openai:unexpected-embedding',
        AI_MODEL_EXTRA: 'anthropic:unexpected',
      }),
    );
    expect(config.models).toEqual({
      default: { provider: 'bedrock', modelId: 'us.openai.gpt-6-luna' },
    });
    expect(config.embeddingModels).toEqual({
      default: { provider: 'bedrock', modelId: 'amazon.titan-embed-text-v2:0' },
    });
    expect(config.defaults).toEqual({
      timeout: '60s',
      retry: { attempts: 2 },
      maxOutputTokens: 800,
    });
    expect(config.embeddingDefaults).toEqual({
      timeout: '30s',
      retry: { attempts: 3 },
    });
    expect(config.providers.openai).toBeUndefined();
    expect(config.providers.anthropic).toBeUndefined();
  });

  it('registers named models across providers without changing process.env', () => {
    const before = { ...process.env };
    const config = loadAiConfig(
      {
        ...environment,
        ANTHROPIC_API_KEY: 'anthropic-key',
        OPENAI_API_KEY: 'openai-key',
      },
      {
        models: {
          default: { provider: 'bedrock', modelId: 'us.openai.gpt-6-luna' },
          fast: { provider: 'anthropic', modelId: 'fast-model' },
          reasoning: { provider: 'openai', modelId: 'reasoning-model' },
        },
        embeddingModels: {
          default: {
            provider: 'bedrock',
            modelId: 'amazon.titan-embed-text-v2:0',
          },
          search_v2: { provider: 'openai', modelId: 'search-embedding' },
        },
      },
    );
    const options = buildAiOptions(config);
    expect(options.models).toMatchObject({
      default: {
        modelId: 'us.openai.gpt-6-luna',
        provider: expect.stringContaining('bedrock'),
      },
      fast: {
        modelId: 'fast-model',
        provider: expect.stringContaining('anthropic'),
      },
      reasoning: {
        modelId: 'reasoning-model',
        provider: expect.stringContaining('openai'),
      },
    });
    expect(options.embeddingModels).toMatchObject({
      default: { modelId: 'amazon.titan-embed-text-v2:0' },
      search_v2: { modelId: 'search-embedding' },
    });
    expect(Object.keys(options.models!)).toEqual([
      'default',
      'fast',
      'reasoning',
    ]);
    expect(Object.keys(options.embeddingModels!)).toEqual([
      'default',
      'search_v2',
    ]);
    expect(createAmazonBedrock).toHaveBeenCalledExactlyOnceWith(
      config.providers.bedrock,
    );
    expect(createAnthropic).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'anthropic-key',
    });
    expect(createOpenAI).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'openai-key',
      baseURL: 'https://api.openai.com/v1',
    });
    expect(options.defaults).toEqual(config.defaults);
    expect(options.embeddingDefaults).toEqual(config.embeddingDefaults);
    expect(process.env).toEqual(before);
  });

  it('switches the default provider through code configuration and ignores unused provider settings', () => {
    const options = buildAiOptions(
      loadAiConfig(
        {
          OPENAI_API_KEY: 'key',
          OPENAI_BASE_URL: 'https://proxy.example.com/v1',
          AWS_REGION: '',
        },
        {
          models: { default: { provider: 'openai', modelId: 'text-model' } },
          embeddingModels: {
            default: { provider: 'openai', modelId: 'embedding-model' },
          },
        },
      ),
    );
    expect(options.models?.default).toMatchObject({
      modelId: 'text-model',
      provider: expect.stringContaining('openai'),
    });
    expect(options.embeddingModels?.default).toMatchObject({
      modelId: 'embedding-model',
    });
    expect(createOpenAI).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'key',
      baseURL: 'https://proxy.example.com/v1',
    });
    expect(createAmazonBedrock).not.toHaveBeenCalled();
    expect(createAnthropic).not.toHaveBeenCalled();
  });

  it.each([buildAiOptions, buildEmbeddingOptions])(
    'keeps matching aliases independent across model registries (%#)',
    (buildOptions) => {
      const options = buildOptions(
        loadAiConfig(
          {
            ...environment,
            OPENAI_API_KEY: 'key',
          },
          {
            models: {
              default: { provider: 'bedrock', modelId: 'us.openai.gpt-6-luna' },
              fast: { provider: 'bedrock', modelId: 'fast-text' },
            },
            embeddingModels: {
              default: {
                provider: 'bedrock',
                modelId: 'amazon.titan-embed-text-v2:0',
              },
              fast: { provider: 'openai', modelId: 'fast-embedding' },
            },
          },
        ),
      );
      expect(options.embeddingModels?.fast).toMatchObject({
        modelId: 'fast-embedding',
      });
      if (buildOptions === buildAiOptions) {
        expect(options.models?.fast).toMatchObject({ modelId: 'fast-text' });
      } else {
        expect(options.models).toBeUndefined();
      }
    },
  );

  it('constructs only embedding providers in the Business API', () => {
    const options = buildEmbeddingOptions(
      loadAiConfig(
        {
          ANTHROPIC_API_KEY: 'anthropic-key',
          OPENAI_API_KEY: 'openai-key',
        },
        {
          models: { default: { provider: 'anthropic', modelId: 'text-model' } },
          embeddingModels: {
            default: { provider: 'openai', modelId: 'embedding-model' },
          },
        },
      ),
    );
    expect(options.models).toBeUndefined();
    expect(options.embeddingModels?.default).toMatchObject({
      modelId: 'embedding-model',
    });
    expect(createOpenAI).toHaveBeenCalledTimes(1);
    expect(createAnthropic).not.toHaveBeenCalled();
    expect(createAmazonBedrock).not.toHaveBeenCalled();
  });

  it('forwards normalized Bedrock credentials and region explicitly', () => {
    const before = { ...process.env };
    buildAiOptions(
      loadAiConfig({
        ...environment,
        AWS_REGION: 'us-west-2',
        AWS_BEARER_TOKEN_BEDROCK: ' bearer ',
        AWS_ACCESS_KEY_ID: ' access ',
        AWS_SECRET_ACCESS_KEY: ' secret ',
        AWS_SESSION_TOKEN: ' session ',
      }),
    );
    expect(createAmazonBedrock).toHaveBeenCalledExactlyOnceWith({
      region: 'us-west-2',
      apiKey: 'bearer',
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      sessionToken: 'session',
    });
    expect(process.env).toEqual(before);
  });
});
