import { z } from 'zod';

export const orderIdSchema = z.string().min(1).max(80);
export const changeAddressSchema = z.object({
  address: z.string().trim().min(8).max(300),
});
export const customerIdentitySchema = z.object({ id: z.string().min(1) });
export const customerOrderSchema = z.object({
  id: z.string(),
  status: z.string(),
  totalCents: z.number().int(),
  deliveryAddress: z.string(),
  refundable: z.boolean(),
});
export type CustomerOrder = z.infer<typeof customerOrderSchema>;
export type ChangeAddress = z.infer<typeof changeAddressSchema>;
