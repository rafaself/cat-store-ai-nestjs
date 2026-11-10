import { z } from 'zod';
import { parseEnv } from './validation.js';

const databaseEnvSchema = z
  .object({
    DATABASE_URL: z
      .string()
      .url()
      .default('postgresql://chatbot:chatbot@127.0.0.1:15432/chatbot'),
  })
  .transform(({ DATABASE_URL: connectionString }) => ({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
  }));

export type DatabaseConfig = z.infer<typeof databaseEnvSchema>;

export function loadDatabaseConfig(
  env: Record<string, unknown>,
): DatabaseConfig {
  return parseEnv(databaseEnvSchema, env);
}
