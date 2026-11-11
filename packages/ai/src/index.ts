import { registerAs } from '@nestjs/config';
import { type BedrockConfig } from '@cat-supplies-store/config';
import type { AiModuleOptions } from '@nestjs/ai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

export const createBedrockConfig = (config: BedrockConfig) =>
  registerAs('bedrock', () => config);

export function buildAiOptions(config: BedrockConfig): AiModuleOptions {
  const bedrock = createAmazonBedrock({
    region: config.region,
    apiKey: config.bearerToken,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken,
  });
  return {
    models: { default: bedrock(config.modelId) },
    embeddingModels: {
      default: bedrock.embedding(config.embeddingModelId),
    },
    defaults: config.defaults,
    embeddingDefaults: config.embeddingDefaults,
  };
}

// The business API only registers embeddings for catalog search/indexing.
export function buildEmbeddingOptions(config: BedrockConfig): AiModuleOptions {
  const bedrock = createAmazonBedrock({
    region: config.region,
    apiKey: config.bearerToken,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken,
  });
  return {
    embeddingModels: { default: bedrock.embedding(config.embeddingModelId) },
    embeddingDefaults: config.embeddingDefaults,
  };
}
