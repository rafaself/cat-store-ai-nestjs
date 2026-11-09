import { z } from 'zod';
import { toOptionalNonEmptyString } from '@app/tools';

const environmentSchema = z.object({
  OPENAI_API_KEY: z.string().optional().transform(toOptionalNonEmptyString),
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-4o-mini'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export function validateEnvironment(config: Record<string, unknown>) {
  const result = environmentSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return result.data;
}
