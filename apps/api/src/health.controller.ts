import { Controller, Get } from '@nestjs/common';
import {
  healthResponseSchema,
  type HealthResponse,
} from '@llm-chatbot-nestjs/contracts';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return healthResponseSchema.parse({ status: 'ok' });
  }
}
