import { z } from 'zod';
import { toOptionalNonEmptyString } from '@llm-chatbot-nestjs/tools';
import { parseEnv } from './validation.js';

const bedrockEnvSchema = z
  .object({
    AWS_REGION: z.string().trim().min(1).default('us-east-1'),
    AWS_BEARER_TOKEN_BEDROCK: z
      .string()
      .optional()
      .transform(toOptionalNonEmptyString),
  })
  .transform(
    ({ AWS_REGION: region, AWS_BEARER_TOKEN_BEDROCK: bearerToken }) => ({
      region,
      bearerToken,
      modelId: 'us.openai.gpt-6-luna',
      embeddingModelId: 'amazon.titan-embed-text-v2:0',
      defaults: {
        timeout: '60s' as const,
        retry: { attempts: 2 },
        maxOutputTokens: 800,
      },
      embeddingDefaults: {
        timeout: '30s' as const,
        retry: { attempts: 3 },
      },
    }),
  );

export type BedrockConfig = z.infer<typeof bedrockEnvSchema>;

export function loadBedrockConfig(env: Record<string, unknown>): BedrockConfig {
  return parseEnv(bedrockEnvSchema, env);
}
