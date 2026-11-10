import { z } from 'zod';
import { parseEnv } from './validation.js';

const queueSchema = z
  .object({
    REDIS_HOST: z.string().trim().min(1).default('127.0.0.1'),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(16379),
  })
  .transform(({ REDIS_HOST: host, REDIS_PORT: port }) => ({ host, port }));

const mailpitSchema = z
  .object({
    MAILPIT_URL: z
      .url({ protocol: /^https?$/ })
      .default('http://127.0.0.1:18025'),
  })
  .transform(({ MAILPIT_URL: url }) => ({ url }));

export function loadQueueConfig(env: Record<string, unknown>) {
  return parseEnv(queueSchema, env);
}

export function loadMailpitConfig(env: Record<string, unknown>) {
  return parseEnv(mailpitSchema, env);
}
