import { registerAs } from '@nestjs/config';
import type { AiModuleOptions } from '@nestjs/ai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { AiConfig } from './config.js';

export {
  loadAiConfig,
  aiModels,
  type AiConfig,
  type AiModelConfig,
} from './config.js';

export const createAiConfig = (config: AiConfig) =>
  registerAs('ai', () => config);

function buildProviders(config: AiConfig, embeddingsOnly = false) {
  const selections = embeddingsOnly
    ? Object.values(config.embeddingModels)
    : [
        ...Object.values(config.models),
        ...Object.values(config.embeddingModels),
      ];
  const used = new Set(selections.map((model) => model.provider));
  return {
    bedrock:
      used.has('bedrock') && config.providers.bedrock
        ? createAmazonBedrock(config.providers.bedrock)
        : undefined,
    anthropic:
      used.has('anthropic') && config.providers.anthropic
        ? createAnthropic(config.providers.anthropic)
        : undefined,
    openai:
      used.has('openai') && config.providers.openai
        ? createOpenAI(config.providers.openai)
        : undefined,
  };
}

function buildEmbeddingModels(
  config: AiConfig,
  providers: ReturnType<typeof buildProviders>,
) {
  return Object.fromEntries(
    Object.entries(config.embeddingModels).map(([name, model]) => {
      const provider = providers[model.provider];
      if (!provider)
        throw new Error(`Missing AI provider configuration: ${model.provider}`);
      return [name, provider.embeddingModel(model.modelId)];
    }),
  );
}

export function buildAiOptions(config: AiConfig): AiModuleOptions {
  const providers = buildProviders(config);
  return {
    models: Object.fromEntries(
      Object.entries(config.models).map(([name, model]) => {
        const provider = providers[model.provider];
        if (!provider)
          throw new Error(
            `Missing AI provider configuration: ${model.provider}`,
          );
        return [name, provider.languageModel(model.modelId)];
      }),
    ),
    embeddingModels: buildEmbeddingModels(config, providers),
    defaults: config.defaults,
    embeddingDefaults: config.embeddingDefaults,
  };
}

// The Business API only constructs providers used by embeddings.
export function buildEmbeddingOptions(config: AiConfig): AiModuleOptions {
  return {
    embeddingModels: buildEmbeddingModels(config, buildProviders(config, true)),
    embeddingDefaults: config.embeddingDefaults,
  };
}
