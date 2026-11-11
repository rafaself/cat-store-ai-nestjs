import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { convertToModelMessages } from 'ai';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { BusinessApiGuard } from '../business-api.guard';
import { AssistantService } from './assistant.service';
import { type ChatRequest, chatRequestSchema } from './assistant.contract';

@Controller('assistant')
@UseGuards(ThrottlerGuard, BusinessApiGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  async chat(
    @Body({ schema: chatRequestSchema })
    body: ChatRequest,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const modelMessages = await convertToModelMessages(body.messages);

    const stream = this.assistant.stream(modelMessages, request);

    response.on('close', () => {
      if (!response.writableEnded) {
        stream.abort();
      }
    });

    await stream.pipeUIMessageStreamToResponse(response, {
      errorText: () => 'An error occurred while generating a response.',
    });
  }
}
