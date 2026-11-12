import { z } from 'zod';

export const conversationIdSchema = z.uuid();
export const chatRequestSchema = z
  .object({
    requestId: z.uuid(),
    text: z
      .string()
      .min(1)
      .max(4_000)
      .refine((text) => text.trim().length > 0, {
        error: 'Message must contain text.',
      }),
  })
  .strict();
export const createConversationSchema = z.object({}).strict();
export const conversationApprovalSchema = z
  .object({ requestId: z.uuid() })
  .strict();
export type ChatRequest = z.output<typeof chatRequestSchema>;
