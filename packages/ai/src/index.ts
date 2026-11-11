import { registerAs } from '@nestjs/config';
import {
  loadBedrockConfig,
  type BedrockConfig,
  type Environment,
} from '@cat-supplies-store/config';
import type { AiModuleOptions } from '@nestjs/ai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

export const createBedrockConfig = (environment: Environment) =>
  registerAs('bedrock', () => loadBedrockConfig(environment));

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
