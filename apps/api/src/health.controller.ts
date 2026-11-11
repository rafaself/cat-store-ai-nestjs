import { Controller, Get } from '@nestjs/common';
import {
  healthResponseSchema,
  type HealthResponse,
} from '@cat-supplies-store/contracts';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return healthResponseSchema.parse({ status: 'ok' });
  }
}
