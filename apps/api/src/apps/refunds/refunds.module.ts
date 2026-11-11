import { Module } from '@nestjs/common';
import { AiWorkflowsModule } from '@nestjs/ai/workflows';
import { OrdersModule } from '../orders/orders.module';
import {
  DemoCustomerGuard,
  SupportApprovalGuard,
} from '../../auth/demo-auth.guard';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [AiWorkflowsModule, OrdersModule],
  controllers: [RefundsController],
  providers: [RefundsService, DemoCustomerGuard, SupportApprovalGuard],
})
export class RefundsModule {}
