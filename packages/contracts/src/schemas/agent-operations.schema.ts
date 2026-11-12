import { z } from 'zod';

export const orderIdSchema = z.string().min(1).max(80);
export const changeAddressSchema = z.object({
  address: z.string().trim().min(8).max(300),
});
export const addressConfirmationIdSchema = z.uuid();
export const confirmedAddressChangeSchema = changeAddressSchema
  .extend({
    confirmationId: addressConfirmationIdSchema,
  })
  .strict();
export const addressChangeToolInputSchema = changeAddressSchema
  .extend({
    orderId: orderIdSchema,
    confirmationId: addressConfirmationIdSchema.optional(),
  })
  .strict();
export const addressChangeProposalSchema = z
  .object({
    status: z.literal('confirmation-required'),
    confirmationId: addressConfirmationIdSchema,
    orderId: orderIdSchema,
    address: changeAddressSchema.shape.address,
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const approveAddressChangeSchema = changeAddressSchema
  .extend({
    approved: z.literal(true),
    orderId: orderIdSchema,
  })
  .strict();
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
export type ConfirmedAddressChange = z.infer<
  typeof confirmedAddressChangeSchema
>;
export type AddressChangeToolInput = z.infer<
  typeof addressChangeToolInputSchema
>;
export type ApproveAddressChange = z.infer<typeof approveAddressChangeSchema>;
