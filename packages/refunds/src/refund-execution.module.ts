import { Module } from '@nestjs/common';
import { AiWorkflowsModule } from '@nestjs/ai/workflows';
import { PaymentsModule } from './payments.module.js';
import { RefundRequestWorkflow } from './refund.workflow.js';
import { RefundTools } from './refund.tools.js';

@Module({
  imports: [AiWorkflowsModule, PaymentsModule],
  providers: [RefundRequestWorkflow, RefundTools],
})
export class RefundExecutionModule {}
