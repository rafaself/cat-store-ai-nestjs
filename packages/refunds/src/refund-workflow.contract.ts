// Shared by the API producer and worker without importing execution providers.
export const refundWorkflow = {
  name: 'refund-request',
  version: 1,
  timeout: '7d',
} as const;

export interface RefundWorkflowInput {
  customerId: string;
  orderId: string;
  reason: string;
}
