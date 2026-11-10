import { z } from 'zod';

export function parseEnv<T>(
  schema: z.ZodType<T>,
  env: Record<string, unknown>,
): T {
  const result = schema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return result.data;
}
