import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBedrockConfig } from '@cat-supplies-store/config';

const mocks = vi.hoisted(() => {
  const textModel = { kind: 'text-model', modelId: 'test-model' };
  const embeddingModel = { kind: 'embedding-model', modelId: 'test-embedding' };
  const embedding = vi.fn((modelId: string) => ({
    ...embeddingModel,
    modelId,
  }));
  const provider = Object.assign(
    vi.fn((modelId: string) => ({ ...textModel, modelId })),
    { embedding },
  );
  return {
    textModel,
    embeddingModel,
    embedding,
    provider,
    create: vi.fn(() => provider),
  };
});

vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: mocks.create,
}));

import { buildAiOptions, buildEmbeddingOptions } from './index.js';

describe('buildAiOptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([buildAiOptions, buildEmbeddingOptions])(
    'registers every embedding alias independently of language models (%#)',
    (buildOptions) => {
      const options = buildOptions(
        loadBedrockConfig({
          BEDROCK_MODEL_DEFAULT: 'text-default',
          BEDROCK_MODEL_FAST: 'text-fast',
          BEDROCK_EMBEDDING_MODEL_DEFAULT: 'embedding-default',
          BEDROCK_EMBEDDING_MODEL_FAST: 'embedding-fast',
          BEDROCK_EMBEDDING_MODEL_SEARCH_V2: 'embedding-search',
        }),
      );
      expect(mocks.create).toHaveBeenCalledTimes(1);
      expect(mocks.embedding).toHaveBeenCalledTimes(3);
      expect(options.embeddingModels).toEqual({
        default: { kind: 'embedding-model', modelId: 'embedding-default' },
        fast: { kind: 'embedding-model', modelId: 'embedding-fast' },
        search_v2: { kind: 'embedding-model', modelId: 'embedding-search' },
      });
      if (buildOptions === buildEmbeddingOptions) {
        expect(mocks.provider).not.toHaveBeenCalled();
        expect(options.models).toBeUndefined();
      } else {
        expect(options.models).toEqual({
          default: { kind: 'text-model', modelId: 'text-default' },
          fast: { kind: 'text-model', modelId: 'text-fast' },
        });
      }
    },
  );

  it('registers each configured alias with its own Bedrock model ID using one provider', () => {
    const options = buildAiOptions(
      loadBedrockConfig({
        BEDROCK_MODEL_DEFAULT: 'default-model',
        BEDROCK_EMBEDDING_MODEL_DEFAULT: 'test-embedding',
        BEDROCK_MODEL_FAST: 'fast-model',
        BEDROCK_MODEL_FAST_REASONING: 'reasoning-model',
      }),
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.provider).toHaveBeenCalledTimes(3);
    expect(options.models).toEqual({
      default: { kind: 'text-model', modelId: 'default-model' },
      fast: { kind: 'text-model', modelId: 'fast-model' },
      fast_reasoning: { kind: 'text-model', modelId: 'reasoning-model' },
    });
    expect(options.embeddingModels).toEqual({ default: mocks.embeddingModel });
  });

  it('configures bearer and AWS credentials without changing the environment', () => {
    const environment = { ...process.env };
    const config = loadBedrockConfig({
      BEDROCK_EMBEDDING_MODEL_DEFAULT: 'test-embedding',
      BEDROCK_MODEL_DEFAULT: 'test-model',
      AWS_REGION: 'us-west-2',
      AWS_BEARER_TOKEN_BEDROCK: 'bearer-example',
      AWS_ACCESS_KEY_ID: 'access-example',
      AWS_SECRET_ACCESS_KEY: 'secret-example',
      AWS_SESSION_TOKEN: 'session-example',
    });
    const options = buildAiOptions(config);
    expect(mocks.create).toHaveBeenCalledWith({
      region: 'us-west-2',
      apiKey: 'bearer-example',
      accessKeyId: 'access-example',
      secretAccessKey: 'secret-example',
      sessionToken: 'session-example',
    });
    expect(mocks.provider).toHaveBeenCalledWith(config.models.default);
    expect(mocks.embedding).toHaveBeenCalledWith(
      config.embeddingModels.default,
    );
    expect(options.models).toEqual({ default: mocks.textModel });
    expect(options.embeddingModels).toEqual({ default: mocks.embeddingModel });
    expect(process.env).toEqual(environment);
  });

  it('registers only embeddings in the business API', () => {
    const config = loadBedrockConfig({
      BEDROCK_EMBEDDING_MODEL_DEFAULT: 'test-embedding',
      BEDROCK_MODEL_DEFAULT: 'test-model',
    });
    const options = buildEmbeddingOptions(config);
    expect(options.models).toBeUndefined();
    expect(options.embeddingModels).toEqual({ default: mocks.embeddingModel });
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it('passes absent credentials through without creating environment values', () => {
    const environment = { ...process.env };
    const config = loadBedrockConfig({
      BEDROCK_EMBEDDING_MODEL_DEFAULT: 'test-embedding',
      BEDROCK_MODEL_DEFAULT: 'test-model',
    });
    buildAiOptions(config);
    expect(mocks.create).toHaveBeenCalledWith({
      region: 'us-east-1',
      apiKey: undefined,
      accessKeyId: undefined,
      secretAccessKey: undefined,
      sessionToken: undefined,
    });
    expect(process.env).toEqual(environment);
  });
});
