import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  refundDecisionSchema,
  refundRequestSchema,
} from '@llm-chatbot-nestjs/contracts';
import { CurrentCustomer } from '../auth/current-customer.decorator';
import {
  DemoCustomerGuard,
  SupportApprovalGuard,
} from '../auth/demo-auth.guard';
import type { DemoCustomer } from '../auth/demo-auth.types';
import { RefundsService } from './refunds.service';

@Controller('refunds')
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post()
  @UseGuards(DemoCustomerGuard)
  request(@CurrentCustomer() customer: DemoCustomer, @Body() body: unknown) {
    const input = refundRequestSchema.safeParse(body);
    if (!input.success) {
      throw new BadRequestException('Provide an order id and refund reason.');
    }
    return this.refunds.requestRefund(
      customer.id,
      input.data.orderId,
      input.data.reason,
    );
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
    @Body() body: unknown,
  ) {
    const input = refundDecisionSchema.safeParse(body);
    if (!input.success || (!input.data.approved && !input.data.reason)) {
      throw new BadRequestException(
        'Provide a decision and a reason when rejecting a refund.',
      );
    }
    return this.refunds.decide(
      runId,
      key,
      input.data.approved,
      input.data.reason ?? '',
    );
  }
}
