import { registerAs } from '@nestjs/config';
import { type BedrockConfig } from '@cat-supplies-store/config';
import type { AiModuleOptions } from '@nestjs/ai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

export const createBedrockConfig = (config: BedrockConfig) =>
  registerAs('bedrock', () => config);

function createBedrockProvider(config: BedrockConfig) {
  return createAmazonBedrock({
    region: config.region,
    apiKey: config.bearerToken,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken,
  });
}

function buildModels(
  config: BedrockConfig,
  bedrock: ReturnType<typeof createAmazonBedrock>,
): NonNullable<AiModuleOptions['models']> {
  return Object.fromEntries(
    Object.entries(config.models).map(([name, modelId]) => [
      name,
      bedrock(modelId),
    ]),
  );
}

function buildEmbeddingModels(
  config: BedrockConfig,
  bedrock: ReturnType<typeof createAmazonBedrock>,
): NonNullable<AiModuleOptions['embeddingModels']> {
  return Object.fromEntries(
    Object.entries(config.embeddingModels).map(([name, modelId]) => [
      name,
      bedrock.embedding(modelId),
    ]),
  );
}

export function buildAiOptions(config: BedrockConfig): AiModuleOptions {
  const bedrock = createBedrockProvider(config);

  return {
    models: buildModels(config, bedrock),
    embeddingModels: buildEmbeddingModels(config, bedrock),
    defaults: config.defaults,
    embeddingDefaults: config.embeddingDefaults,
  };
}

// The business API only registers embeddings for catalog search/indexing.
export function buildEmbeddingOptions(config: BedrockConfig): AiModuleOptions {
  const bedrock = createBedrockProvider(config);

  return {
    embeddingModels: buildEmbeddingModels(config, bedrock),
    embeddingDefaults: config.embeddingDefaults,
  };
}
