import {
  loadAiProviderConfig,
  type AiProvider,
} from '@cat-supplies-store/config';
import type { AiModuleOptions } from '@nestjs/ai';

export interface ModelSelection {
  provider: AiProvider;
  modelId: string;
}

export interface AiModelConfig {
  models: Record<string, ModelSelection> & { default: ModelSelection };
  embeddingModels: Record<
    string,
    ModelSelection & { provider: 'bedrock' | 'openai' }
  > & {
    default: ModelSelection & { provider: 'bedrock' | 'openai' };
  };
}

// Model changes are application changes: review and evaluate them with the code.
export const aiModels = {
  models: {
    default: { provider: 'bedrock', modelId: 'us.openai.gpt-6-luna' },
  },
  embeddingModels: {
    // Catalog vectors must have 1024 dimensions. Reindex when changing the model.
    default: { provider: 'bedrock', modelId: 'amazon.titan-embed-text-v2:0' },
  },
} satisfies AiModelConfig;

const defaults = {
  timeout: '60s',
  retry: { attempts: 2 },
  maxOutputTokens: 800,
} satisfies AiModuleOptions['defaults'];

const embeddingDefaults = {
  timeout: '30s',
  retry: { attempts: 3 },
} satisfies AiModuleOptions['embeddingDefaults'];

export function loadAiConfig(
  environment: NodeJS.ProcessEnv,
  selections: AiModelConfig = aiModels,
) {
  const providers = loadAiProviderConfig(
    environment,
    [
      ...Object.values(selections.models),
      ...Object.values(selections.embeddingModels),
    ].map((model) => model.provider),
  );
  return { ...selections, providers, defaults, embeddingDefaults };
}

export type AiConfig = ReturnType<typeof loadAiConfig>;
