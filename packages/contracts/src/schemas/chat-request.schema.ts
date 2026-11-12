import { z } from 'zod';

const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  state: z.literal('done').optional(),
});

// Tool calls and results are produced server-side and are never accepted from clients.
const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  parts: z
    .array(textPartSchema)
    .min(1)
    .refine((parts) => parts.some((part) => part.text.trim().length > 0), {
      error: 'Message must contain content.',
    }),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1)
    .max(40)
    .refine((messages) => messages[0]?.role === 'user', {
      error: 'Conversation must start with a user message.',
    })
    .refine(
      (messages) =>
        new Set(messages.map((message) => message.id)).size === messages.length,
      {
        error: 'Message IDs must be unique.',
      },
    )
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
