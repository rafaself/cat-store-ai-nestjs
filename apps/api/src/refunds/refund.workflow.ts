import { AiAgents } from '@nestjs/ai/workflows';
import { Injectable } from '@nestjs/common';
import { Workflow, type WorkflowContext } from '@nestjs/workflows';

export interface RefundWorkflowInput {
  customerId: string;
  orderId: string;
  reason: string;
}

@Injectable()
@Workflow('refund-request', { timeout: '7d' })
export class RefundRequestWorkflow {
  constructor(private readonly agents: AiAgents) {}

  run(ctx: WorkflowContext, input: RefundWorkflowInput) {
    return this.agents.run(ctx, {
      model: 'default',
      label: 'refund-request',
      instructions:
        'You are a customer support agent. Request approval to refund the customer order described by the customer. Call issue-refund for that order and give the approval reviewer the stated reason. Do not claim a refund was issued before approval.',
      prompt: `Customer ${input.customerId} requests a refund for order ${input.orderId}. Reason: ${input.reason}`,
      tools: ['issue-refund'],
      approve: ['issue-refund'],
      maxSteps: 3,
      caller: { user: { id: input.customerId } },
    });
  }
}
