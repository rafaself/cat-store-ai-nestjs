import { z } from 'zod';

export const refundRequestSchema = z
  .object({
    orderId: z.string().min(1).max(80),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const refundDecisionSchema = z
  .object({
    approved: z.boolean(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(({ approved, reason }) => approved || Boolean(reason), {
    path: ['reason'],
    error: 'A reason is required when rejecting a refund.',
  });

export const refundWorkflowStatusSchema = z.enum([
  'pending',
  'running',
  'suspended',
  'compensating',
  'completed',
  'failed',
  'cancelled',
  'compensation_failed',
]);

export const refundRequestResponseSchema = z
  .object({
    runId: z.string().min(1),
    status: refundWorkflowStatusSchema,
  })
  .strict();

export const pendingRefundApprovalSchema = z
  .object({
    key: z.string(),
    runId: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
  })
  .strict();

export const pendingRefundApprovalsResponseSchema = z.array(
  pendingRefundApprovalSchema,
);

export const refundDecisionResponseSchema = z
  .object({
    runId: z.string().min(1),
    approved: z.boolean(),
  })
  .strict();

export type RefundRequest = z.infer<typeof refundRequestSchema>;
export type RefundDecision = z.infer<typeof refundDecisionSchema>;
export type RefundWorkflowStatus = z.infer<typeof refundWorkflowStatusSchema>;
export type RefundRequestResponse = z.infer<typeof refundRequestResponseSchema>;
export type PendingRefundApproval = z.infer<typeof pendingRefundApprovalSchema>;
export type RefundDecisionResponse = z.infer<
  typeof refundDecisionResponseSchema
>;
