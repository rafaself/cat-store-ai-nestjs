import { z } from 'zod';
import { toOptionalNonEmptyString } from '@cat-supplies-store/tools';
import { parseEnv } from './validation.js';

const authEnvSchema = z
  .object({
    DEMO_CUSTOMER_TOKEN: z
      .string()
      .optional()
      .transform(toOptionalNonEmptyString),
    SUPPORT_APPROVAL_TOKEN: z
      .string()
      .optional()
      .transform(toOptionalNonEmptyString),
  })
  .superRefine((config, context) => {
    if (
      config.DEMO_CUSTOMER_TOKEN &&
      config.DEMO_CUSTOMER_TOKEN === config.SUPPORT_APPROVAL_TOKEN
    ) {
      context.addIssue({
        code: 'custom',
        path: ['SUPPORT_APPROVAL_TOKEN'],
        message: 'must differ from DEMO_CUSTOMER_TOKEN',
      });
    }
  })
  .transform(
    ({
      DEMO_CUSTOMER_TOKEN: demoCustomerToken,
      SUPPORT_APPROVAL_TOKEN: supportApprovalToken,
    }) => ({ demoCustomerToken, supportApprovalToken }),
  );

export type AuthConfig = z.infer<typeof authEnvSchema>;

export function loadAuthConfig(env: Record<string, unknown>): AuthConfig {
  return parseEnv(authEnvSchema, env);
}
