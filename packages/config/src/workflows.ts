import { z } from 'zod';
import { parseEnv } from './validation.js';

const workflowEnvSchema = z
  .object({
    WORKFLOWS_ENCRYPTION_KEY: z
      .string()
      .trim()
      .min(1)
      .refine((value) => {
        const decoded = Buffer.from(value, 'base64');
        return decoded.length === 32 && decoded.toString('base64') === value;
      }, 'must be a base64-encoded 32-byte key'),
  })
  .transform(({ WORKFLOWS_ENCRYPTION_KEY: encryptionKey }) => ({
    encryptionKey,
    worker: { concurrency: 4, pollInterval: '1s' as const },
    retry: { attempts: 2, backoff: { delay: 250, jitter: 'none' as const } },
  }));

export type WorkflowConfig = z.infer<typeof workflowEnvSchema>;

export function loadWorkflowConfig(
  env: Record<string, unknown>,
): WorkflowConfig {
  return parseEnv(workflowEnvSchema, env);
}
