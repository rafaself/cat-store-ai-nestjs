import { z } from 'zod';
import { toOptionalNonEmptyString } from '@cat-supplies-store/tools';
import { parseEnv } from './validation.js';

function modelRegistrySchema(prefix: string) {
  const defaultVariable = `${prefix}DEFAULT`;
  return z
    .record(
      z.string().regex(new RegExp(`^${prefix}[A-Z][A-Z0-9_]*$`)),
      z.string().trim().min(1),
    )
    .refine((models) => Object.hasOwn(models, defaultVariable), {
      path: [defaultVariable],
      error: `${defaultVariable} is required.`,
    })
    .transform((models) =>
      Object.fromEntries(
        Object.entries(models).map(([name, modelId]) => [
          name.slice(prefix.length).toLowerCase(),
          modelId,
        ]),
      ),
    );
}

const bedrockEnvSchema = z
  .object({
    models: modelRegistrySchema('BEDROCK_MODEL_'),
    embeddingModels: modelRegistrySchema('BEDROCK_EMBEDDING_MODEL_'),
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
      models,
      embeddingModels,
    }) => ({
      region,
      bearerToken,
      accessKeyId,
      secretAccessKey,
      sessionToken,
      models,
      embeddingModels,
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

export function loadBedrockConfig(env: NodeJS.ProcessEnv): BedrockConfig {
  const entries = Object.entries(env);
  return parseEnv(bedrockEnvSchema, {
    ...env,
    models: Object.fromEntries(
      entries.filter(([name]) => name.startsWith('BEDROCK_MODEL_')),
    ),
    embeddingModels: Object.fromEntries(
      entries.filter(([name]) => name.startsWith('BEDROCK_EMBEDDING_MODEL_')),
    ),
  });
}
