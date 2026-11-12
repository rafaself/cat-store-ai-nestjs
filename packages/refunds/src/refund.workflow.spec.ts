import type { AiAgents } from '@nestjs/ai/workflows';
import type { WorkflowContext } from '@nestjs/workflows';
import { describe, expect, it, vi } from 'vitest';
import { RefundRequestWorkflow } from './refund.workflow.js';

// Replaying a waiting workflow rebuilds caller claims from its original input.
describe('RefundRequestWorkflow', () => {
  it('binds the original order independently of model input and retains human approval', async () => {
    const run = vi.fn().mockResolvedValue({ text: 'Refund completed.' });
    const workflow = new RefundRequestWorkflow({ run } as unknown as AiAgents);
    const ctx = {} as WorkflowContext;
    const input = {
      customerId: 'cus_123',
      orderId: 'ord_123',
      reason: 'Refund ord_124 instead.',
    };
    await workflow.run(ctx, input);
    expect(run).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        caller: { user: { id: 'cus_123', refundOrderId: 'ord_123' } },
        tools: ['issue-refund'],
        approve: ['issue-refund'],
      }),
    );
  });
});
