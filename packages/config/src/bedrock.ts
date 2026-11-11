import { z } from 'zod';
import { toOptionalNonEmptyString } from '@cat-supplies-store/tools';
import { parseEnv } from './validation.js';

const bedrockEnvSchema = z
  .object({
    AWS_REGION: z.string().trim().min(1).default('us-east-1'),
    AWS_BEARER_TOKEN_BEDROCK: z
      .string()
      .optional()
      .transform(toOptionalNonEmptyString),
    AWS_ACCESS_KEY_ID: z
      .string()
      .optional()
      .transform(toOptionalNonEmptyString),
    AWS_SECRET_ACCESS_KEY: z
      .string()
      .optional()
      .transform(toOptionalNonEmptyString),
    AWS_SESSION_TOKEN: z
      .string()
      .optional()
      .transform(toOptionalNonEmptyString),
  })
  .transform(
    ({
      AWS_REGION: region,
      AWS_BEARER_TOKEN_BEDROCK: bearerToken,
      AWS_ACCESS_KEY_ID: accessKeyId,
      AWS_SECRET_ACCESS_KEY: secretAccessKey,
      AWS_SESSION_TOKEN: sessionToken,
    }) => ({
      region,
      bearerToken,
      accessKeyId,
      secretAccessKey,
      sessionToken,
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
