import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  createEmailJobSchema,
  type CreateEmailJob,
} from '@cat-supplies-store/contracts';
import { SupportApprovalGuard } from '../../auth/demo-auth.guard';
import { EmailJobsService } from './email-jobs.service';

@Controller('email-jobs')
@UseGuards(SupportApprovalGuard)
export class EmailJobsController {
  constructor(private readonly jobs: EmailJobsService) {}

  @Post()
  create(@Body({ schema: createEmailJobSchema }) input: CreateEmailJob) {
    return this.jobs.create(input.messageId);
  }

  @Get(':jobId')
  get(@Param('jobId') jobId: string) {
    return this.jobs.get(jobId);
  }
}
