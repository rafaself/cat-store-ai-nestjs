import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBedrockConfig } from '@cat-supplies-store/config';

const mocks = vi.hoisted(() => {
  const textModel = { kind: 'text-model' };
  const embeddingModel = { kind: 'embedding-model' };
  const embedding = vi.fn(() => embeddingModel);
  const provider = Object.assign(
    vi.fn(() => textModel),
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

  it('configures bearer and AWS credentials without changing the environment', () => {
    const environment = { ...process.env };
    const config = loadBedrockConfig({
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
    expect(mocks.provider).toHaveBeenCalledWith(config.modelId);
    expect(mocks.embedding).toHaveBeenCalledWith(config.embeddingModelId);
    expect(options.models).toEqual({ default: mocks.textModel });
    expect(options.embeddingModels).toEqual({ default: mocks.embeddingModel });
    expect(process.env).toEqual(environment);
  });

  it('registers only embeddings in the business API', () => {
    const config = loadBedrockConfig({});
    const options = buildEmbeddingOptions(config);
    expect(options.models).toBeUndefined();
    expect(options.embeddingModels).toEqual({ default: mocks.embeddingModel });
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it('passes absent credentials through without creating environment values', () => {
    const environment = { ...process.env };
    const config = loadBedrockConfig({});
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
