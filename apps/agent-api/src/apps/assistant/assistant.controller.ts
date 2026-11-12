import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { convertToModelMessages } from 'ai';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CustomerAuthGuard } from '../../auth/customer-auth.guard';
import type { CustomerRequest } from '../../integrations/business-api/business-api.client';
import { AssistantService } from './assistant.service';
import { ChatStreamService } from './chat-stream.service';
import { type ChatRequest, chatRequestSchema } from './assistant.contract';

@Controller('assistant')
@UseGuards(ThrottlerGuard, CustomerAuthGuard)
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly streams: ChatStreamService,
  ) {}

  @Post('chat')
  async chat(
    @Body({ schema: chatRequestSchema }) body: ChatRequest,
    @Req() request: CustomerRequest,
  ): Promise<Response> {
    if (!request.customerId) throw new UnauthorizedException();
    const modelMessages = await convertToModelMessages(body.messages);
    return this.streams.open(request.customerId, (signal) =>
      this.assistant.stream(modelMessages, request, signal),
    );
  }
}
