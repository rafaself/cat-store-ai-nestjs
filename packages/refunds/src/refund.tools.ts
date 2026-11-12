import { AgentFunction, type AgentFunctionContext } from '@nestjs/ai';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';
import { PaymentsService } from './payments.service.js';

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
    context: AgentFunctionContext<
      unknown,
      { id?: unknown; refundOrderId?: unknown }
    >,
  ) {
    const customerId = context.user?.id;
    const refundOrderId = context.user?.refundOrderId;
    if (
      typeof customerId !== 'string' ||
      typeof refundOrderId !== 'string' ||
      !refundOrderId ||
      !context.idempotencyKey
    ) {
      throw new UnauthorizedException(
        'Refunds require an authenticated durable workflow.',
      );
    }
    if (orderId !== refundOrderId) {
      throw new ForbiddenException(
        'Refund order must match the original request.',
      );
    }
    return this.payments.refundOrder(
      customerId,
      refundOrderId,
      context.idempotencyKey,
    );
  }
}
