import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { convertToModelMessages, validateUIMessages } from 'ai';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { chatRequestSchema } from '@cat-supplies-store/contracts';
import { DemoCustomerGuard } from '../../auth/demo-auth.guard';
import { AssistantService } from './assistant.service';

const maxConversationCharacters = 20_000;

@Controller('assistant')
@UseGuards(ThrottlerGuard, DemoCustomerGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  async chat(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Provide between 1 and 40 valid messages.');
    }

    let messages;
    try {
      messages = await validateUIMessages({ messages: parsed.data.messages });
    } catch {
      throw new BadRequestException('The chat messages are invalid.');
    }

    if (
      messages.at(-1)?.role !== 'user' ||
      messages.some(
        (message) =>
          message.role === 'system' ||
          message.parts.some((part) => part.type !== 'text'),
      )
    ) {
      throw new BadRequestException(
        'Only text conversations ending in a user message are supported.',
      );
    }

    const characterCount = messages.reduce(
      (total, message) =>
        total +
        message.parts.reduce(
          (messageTotal, part) =>
            messageTotal + (part.type === 'text' ? part.text.length : 0),
          0,
        ),
      0,
    );
    if (characterCount > maxConversationCharacters) {
      throw new HttpException(
        'The conversation is too long.',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const modelMessages = await convertToModelMessages(messages);
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
