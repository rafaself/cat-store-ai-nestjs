import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createEmailJobSchema } from '@cat-supplies-store/contracts';
import { SupportApprovalGuard } from '../../auth/demo-auth.guard';
import { EmailJobsService } from './email-jobs.service';

@Controller('email-jobs')
@UseGuards(SupportApprovalGuard)
export class EmailJobsController {
  constructor(private readonly jobs: EmailJobsService) {}

  @Post()
  create(@Body() body: unknown) {
    const parsed = createEmailJobSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('A valid Mailpit message ID is required.');
    return this.jobs.create(parsed.data.messageId);
  }

  @Get(':jobId')
  get(@Param('jobId') jobId: string) {
    return this.jobs.get(jobId);
  }
}
