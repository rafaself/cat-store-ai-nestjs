import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  refundDecisionSchema,
  refundRequestSchema,
  type RefundDecision,
  type RefundRequest,
} from '@cat-supplies-store/contracts';
import { CurrentCustomer } from '../../auth/current-customer.decorator';
import {
  DemoCustomerGuard,
  SupportApprovalGuard,
} from '../../auth/demo-auth.guard';
import type { DemoCustomer } from '../../auth/demo-auth.types';
import { RefundsService } from './refunds.service';

@Controller('refunds')
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post()
  @UseGuards(DemoCustomerGuard)
  request(
    @CurrentCustomer() customer: DemoCustomer,
    @Body({ schema: refundRequestSchema }) input: RefundRequest,
  ) {
    return this.refunds.requestRefund(customer.id, input.orderId, input.reason);
  }

  @Get(':runId/approvals')
  @UseGuards(SupportApprovalGuard)
  pending(@Param('runId') runId: string) {
    return this.refunds.pendingApprovals(runId);
  }

  @Post(':runId/approvals/:key')
  @UseGuards(SupportApprovalGuard)
  decide(
    @Param('runId') runId: string,
    @Param('key') key: string,
    @Body({ schema: refundDecisionSchema }) input: RefundDecision,
  ) {
    return this.refunds.decide(runId, key, input.approved, input.reason ?? '');
  }
}
