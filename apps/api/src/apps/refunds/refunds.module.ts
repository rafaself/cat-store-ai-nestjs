import { Module } from '@nestjs/common';
import { AiWorkflowsModule } from '@nestjs/ai/workflows';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import {
  DemoCustomerGuard,
  SupportApprovalGuard,
} from '../../auth/demo-auth.guard';
import { RefundsController } from './refunds.controller';
import { RefundRequestWorkflow } from './refund.workflow';
import { RefundTools } from './refund.tools';
import { RefundsService } from './refunds.service';

@Module({
  imports: [AiWorkflowsModule, OrdersModule, PaymentsModule],
  controllers: [RefundsController],
  providers: [
    RefundRequestWorkflow,
    RefundTools,
    RefundsService,
    DemoCustomerGuard,
    SupportApprovalGuard,
  ],
})
export class RefundsModule {}
