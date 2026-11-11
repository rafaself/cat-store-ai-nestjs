import { z } from 'zod';

export const mailpitMessageSchema = z.object({
  ID: z.string(),
  Subject: z.string().default(''),
  Text: z.string().nullable().optional(),
  From: z.object({ Address: z.string(), Name: z.string().optional() }),
});
