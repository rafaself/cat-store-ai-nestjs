import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  chatRequestSchema,
  conversationIdSchema,
  conversationApprovalSchema,
  createConversationSchema,
  addressConfirmationIdSchema,
  type ChatRequest,
} from '@cat-supplies-store/contracts';
import { CustomerAuthGuard } from '../../auth/customer-auth.guard';
import type { CustomerRequest } from '../../integrations/business-api/business-api.client';
import { ConversationService } from './conversation.service';

@Controller('assistant/conversations')
@UseGuards(ThrottlerGuard, CustomerAuthGuard)
export class AssistantController {
  constructor(private readonly conversations: ConversationService) {}
  @Post()
  create(
    @Body({ schema: createConversationSchema }) _body: Record<string, never>,
    @Req() request: CustomerRequest,
  ) {
    return this.conversations.create(request);
  }
  @Get()
  list(@Req() request: CustomerRequest) {
    return this.conversations.list(request);
  }
  @Get(':conversationId')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  history(
    @Param('conversationId', { schema: conversationIdSchema }) id: string,
    @Req() request: CustomerRequest,
  ) {
    return this.conversations.history(id, request);
  }
  @Post(':conversationId/messages')
  send(
    @Param('conversationId', { schema: conversationIdSchema }) id: string,
    @Body({ schema: chatRequestSchema }) body: ChatRequest,
    @Req() request: CustomerRequest,
  ) {
    return this.conversations.send(id, body, request);
  }
  @Post(':conversationId/approvals/:confirmationId')
  approve(
    @Param('conversationId', { schema: conversationIdSchema }) id: string,
    @Param('confirmationId', { schema: addressConfirmationIdSchema })
    confirmationId: string,
    @Body({ schema: conversationApprovalSchema }) body: { requestId: string },
    @Req() request: CustomerRequest,
  ) {
    return this.conversations.approve(
      id,
      confirmationId,
      body.requestId,
      request,
    );
  }
}
