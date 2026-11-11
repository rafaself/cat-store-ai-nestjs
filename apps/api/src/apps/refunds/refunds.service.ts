import { Injectable, NotFoundException } from '@nestjs/common';
import { AiAgents } from '@nestjs/ai/workflows';
import { WorkflowClient } from '@nestjs/workflows';
import { randomUUID } from 'node:crypto';
import {
  pendingRefundApprovalsResponseSchema,
  refundDecisionResponseSchema,
  refundRequestResponseSchema,
  type PendingRefundApproval,
  type RefundDecisionResponse,
  type RefundRequestResponse,
} from '@cat-supplies-store/contracts';
import { OrdersService } from '../orders/orders.service';
import {
  refundWorkflow,
  type RefundWorkflowInput,
} from '@cat-supplies-store/refunds/contract';

@Injectable()
export class RefundsService {
  constructor(
    private readonly workflows: WorkflowClient,
    private readonly agents: AiAgents,
    private readonly orders: OrdersService,
  ) {}

  async requestRefund(
    customerId: string,
    orderId: string,
    reason: string,
  ): Promise<RefundRequestResponse> {
    const order = await this.orders.findForCustomer(customerId, orderId);
    if (!order || !order.refundable || order.status !== 'delivered') {
      throw new NotFoundException('Refundable order not found.');
    }
    const id = `refund-${randomUUID()}`;
    const started = await this.workflows.start(
      refundWorkflow.name,
      { customerId, orderId, reason } satisfies RefundWorkflowInput,
      { id, version: refundWorkflow.version, timeout: refundWorkflow.timeout },
    );
    return refundRequestResponseSchema.parse({
      runId: started.id,
      status: started.status,
    });
  }

  async pendingApprovals(runId: string): Promise<PendingRefundApproval[]> {
    const instance = await this.workflows.getStatus(runId);
    if (!instance || instance.workflow !== refundWorkflow.name) {
      throw new NotFoundException('Refund request not found.');
    }
    return pendingRefundApprovalsResponseSchema.parse(
      await this.agents.pendingApprovals(runId),
    );
  }

  async decide(
    runId: string,
    approvalKey: string,
    approved: boolean,
    reason: string,
  ): Promise<RefundDecisionResponse> {
    const pending = await this.pendingApprovals(runId);
    if (!pending.some((approval) => approval.key === approvalKey)) {
      throw new NotFoundException('Pending refund approval not found.');
    }
    if (approved) {
      await this.agents.approve(approvalKey, { by: 'support-reviewer' });
      return refundDecisionResponseSchema.parse({ runId, approved: true });
    }
    await this.agents.reject(approvalKey, {
      reason,
      by: 'support-reviewer',
    });
    return refundDecisionResponseSchema.parse({ runId, approved: false });
  }
}
