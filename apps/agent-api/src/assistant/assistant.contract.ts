import { chatRequestSchema as baseChatRequestSchema } from '@cat-supplies-store/contracts';
import { safeValidateUIMessages } from 'ai';
import z from 'zod';

export const chatRequestSchema = baseChatRequestSchema.refine(
  async ({ messages }) => {
    const result = await safeValidateUIMessages({
      messages,
    });

    return result.success;
  },
  {
    error: 'Invalid UI messages.',
    path: ['messages'],
  },
);

export type ChatRequest = z.output<typeof chatRequestSchema>;
