import { z } from 'zod';

const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  state: z.enum(['streaming', 'done']).optional(),
});

const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  parts: z.array(textPartSchema),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1)
    .max(40)
    .refine((messages) => messages.at(-1)?.role === 'user', {
      error: 'Conversation must end with a user message.',
    })
    .refine(
      (messages) =>
        messages.reduce(
          (total, message) =>
            total +
            message.parts.reduce((sum, part) => sum + part.text.length, 0),
          0,
        ) <= 20_000,
      { error: 'Conversation is too long.' },
    ),
});

export type ChatRequest = z.output<typeof chatRequestSchema>;
