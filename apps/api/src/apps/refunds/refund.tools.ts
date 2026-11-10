import { AgentFunction, type AgentFunctionContext } from '@nestjs/ai';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class RefundTools {
  constructor(private readonly payments: PaymentsService) {}

  @AgentFunction({
    name: 'issue-refund',
    description:
      'Issue the simulated full refund for a delivered order after a support reviewer approves it.',
    inputSchema: z.object({
      orderId: z.string().min(1).max(80),
      reason: z.string().trim().min(3).max(500),
    }),
  })
  async issueRefund(
    { orderId }: { orderId: string; reason: string },
    context: AgentFunctionContext,
  ) {
    const customerId = context.user?.id;
    if (typeof customerId !== 'string' || !context.idempotencyKey) {
      throw new UnauthorizedException(
        'Refunds require an authenticated durable workflow.',
      );
    }
    return this.payments.refundOrder(
      customerId,
      orderId,
      context.idempotencyKey,
    );
  }
}
