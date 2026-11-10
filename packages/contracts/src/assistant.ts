import { z } from 'zod';

export const chatRequestSchema = z
  .object({
    messages: z.array(z.unknown()).min(1).max(40),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;
