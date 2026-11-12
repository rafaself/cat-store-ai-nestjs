import { z } from 'zod';
import { addressChangeProposalSchema } from './agent-operations.schema.js';

export const chatActivitySchema = z
  .object({
    activity: z.enum([
      'thinking',
      'finding-order',
      'searching-products',
      'preparing-address-change',
      'checking-details',
      'responding',
    ]),
  })
  .strict();
export type ChatActivity = z.infer<typeof chatActivitySchema>;
export const chatActivityLabels: Record<ChatActivity['activity'], string> = {
  thinking: 'Thinking…',
  'finding-order': 'Finding your order…',
  'searching-products': 'Searching products…',
  'preparing-address-change': 'Checking the address change…',
  'checking-details': 'Checking the details…',
  responding: 'Writing your response…',
};

export const addressApprovalSchema = addressChangeProposalSchema.omit({
  status: true,
});
export type AddressApproval = z.infer<typeof addressApprovalSchema>;
export const publicChatMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(['user', 'assistant']),
    parts: z
      .array(
        z.union([
          z.object({ type: z.literal('text'), text: z.string() }).strict(),
          z
            .object({
              type: z.literal('data-address-approval'),
              id: z.string(),
              data: addressApprovalSchema,
            })
            .strict(),
        ]),
      )
      .min(1),
  })
  .strict();
export type PublicChatMessage = z.infer<typeof publicChatMessageSchema>;
export const conversationHistorySchema = z
  .object({
    id: z.uuid(),
    messages: z.array(publicChatMessageSchema),
    active: z.boolean(),
    approvals: z.array(
      z
        .object({
          confirmationId: z.uuid(),
          status: z.enum([
            'pending',
            'executing',
            'completed',
            'failed',
            'unknown',
          ]),
        })
        .strict(),
    ),
    turns: z.array(
      z
        .object({
          id: z.uuid(),
          requestId: z.uuid(),
          status: z.enum(['running', 'completed', 'failed', 'interrupted']),
          sequence: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();
export type ConversationHistory = z.infer<typeof conversationHistorySchema>;
