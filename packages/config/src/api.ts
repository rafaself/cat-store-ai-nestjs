import { z } from 'zod';
import { parseEnv } from './validation.js';

const apiEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  })
  .transform(({ NODE_ENV: environment, PORT: port }) => ({
    environment,
    port,
  }));

export type ApiConfig = z.infer<typeof apiEnvSchema>;

export function loadApiConfig(env: Record<string, unknown>): ApiConfig {
  return parseEnv(apiEnvSchema, env);
}
