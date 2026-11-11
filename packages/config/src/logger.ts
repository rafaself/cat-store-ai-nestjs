import { z } from 'zod';
import { parseEnv } from './validation.js';

const levels = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'] as const;

const loggerEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    LOG_LEVEL: z.enum(levels).optional(),
  })
  .transform(({ NODE_ENV: environment, LOG_LEVEL: level }) => {
    const minimum =
      level ??
      (environment === 'production'
        ? 'log'
        : environment === 'test'
          ? 'warn'
          : 'debug');
    const json = environment === 'production';
    return {
      logLevels: levels.slice(levels.indexOf(minimum)),
      json,
      ...(json ? { colors: false } : {}),
    };
  });

export type LoggerConfig = z.infer<typeof loggerEnvSchema>;

export function loadLoggerConfig(env: Record<string, unknown>): LoggerConfig {
  return parseEnv(loggerEnvSchema, env);
}
