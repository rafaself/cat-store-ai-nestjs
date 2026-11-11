import { z } from 'zod';

export const emailClassificationSchema = z.object({
  category: z.enum(['order', 'billing', 'product', 'other']),
  orderId: z.string().nullable(),
  urgent: z.boolean(),
  summary: z.string().min(1).max(500),
});

export type EmailClassification = z.infer<typeof emailClassificationSchema>;
