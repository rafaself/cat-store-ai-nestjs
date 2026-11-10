import { registerAs, type ConfigType } from '@nestjs/config';
import { loadBedrockConfig } from '@llm-chatbot-nestjs/config';

export const bedrockConfig = registerAs('bedrock', () =>
  loadBedrockConfig(process.env),
);

export async function buildAiOptions(config: ConfigType<typeof bedrockConfig>) {
  process.env.AWS_REGION = config.region;
  if (config.bearerToken) {
    process.env.AWS_BEARER_TOKEN_BEDROCK = config.bearerToken;
  } else {
    delete process.env.AWS_BEARER_TOKEN_BEDROCK;
  }
  const { amazonBedrock } = await import('@ai-sdk/amazon-bedrock');
  return {
    models: { default: amazonBedrock(config.modelId) },
    embeddingModels: {
      default: amazonBedrock.embedding(config.embeddingModelId),
    },
    defaults: config.defaults,
    embeddingDefaults: config.embeddingDefaults,
  };
}
