import { z } from 'zod';
import { emailClassificationSchema } from './email-classification.schema.js';

export const EMAIL_QUEUE = 'email';
export const DRAFT_EMAIL_JOB = 'draft-email';

export const emailMessageIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/)
  .refine((id) => id !== 'latest');

export const createEmailJobSchema = z
  .object({ messageId: emailMessageIdSchema })
  .strict();

export const emailJobPayloadSchema = createEmailJobSchema
  .extend({ requesterId: z.string().min(1).max(100) })
  .strict();

export const emailJobIdSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const emailJobAcceptedSchema = z
  .object({ jobId: emailJobIdSchema })
  .strict();

export const emailJobStatusSchema = z
  .object({
    jobId: emailJobIdSchema,
    status: z.enum(['pending', 'processing', 'completed', 'failed']),
    result: z
      .object({
        subject: z.string(),
        sender: z.string(),
        classification: emailClassificationSchema,
        draft: z.string(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type CreateEmailJob = z.infer<typeof createEmailJobSchema>;
export type EmailJobPayload = z.infer<typeof emailJobPayloadSchema>;
