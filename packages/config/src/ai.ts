import { z } from 'zod';
import { toOptionalNonEmptyString } from '@cat-supplies-store/tools';
import { parseEnv } from './validation.js';

const optionalCredential = z
  .string()
  .optional()
  .transform(toOptionalNonEmptyString);

const bedrockEnvSchema = z
  .object({
    AWS_REGION: z.string().trim().min(1).default('us-east-1'),
    AWS_BEARER_TOKEN_BEDROCK: optionalCredential,
    AWS_ACCESS_KEY_ID: optionalCredential,
    AWS_SECRET_ACCESS_KEY: optionalCredential,
    AWS_SESSION_TOKEN: optionalCredential,
  })
  .refine(
    (env) =>
      Boolean(
        env.AWS_BEARER_TOKEN_BEDROCK ||
        (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY),
      ),
    {
      path: ['AWS_BEARER_TOKEN_BEDROCK'],
      error:
        'Configure AWS_BEARER_TOKEN_BEDROCK or both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.',
    },
  )
  .transform((env) => ({
    region: env.AWS_REGION,
    apiKey: env.AWS_BEARER_TOKEN_BEDROCK,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    sessionToken: env.AWS_SESSION_TOKEN,
  }));

const openaiEnvSchema = z
  .object({
    OPENAI_API_KEY: z.string().trim().min(1),
    OPENAI_BASE_URL: z.url().default('https://api.openai.com/v1'),
  })
  .transform((env) => ({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  }));

const anthropicEnvSchema = z
  .object({
    ANTHROPIC_API_KEY: z.string().trim().min(1),
  })
  .transform((env) => ({ apiKey: env.ANTHROPIC_API_KEY }));

export type AiProvider = 'bedrock' | 'anthropic' | 'openai';

export function loadAiProviderConfig(
  env: NodeJS.ProcessEnv,
  selectedProviders: Iterable<AiProvider>,
) {
  const usedProviders = new Set(selectedProviders);
  return {
    bedrock: usedProviders.has('bedrock')
      ? parseEnv(bedrockEnvSchema, env)
      : undefined,
    openai: usedProviders.has('openai')
      ? parseEnv(openaiEnvSchema, env)
      : undefined,
    anthropic: usedProviders.has('anthropic')
      ? parseEnv(anthropicEnvSchema, env)
      : undefined,
  };
}

export type AiProviderConfig = ReturnType<typeof loadAiProviderConfig>;
