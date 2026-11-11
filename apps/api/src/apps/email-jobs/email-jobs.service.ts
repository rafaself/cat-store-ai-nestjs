import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { createEmailJobId } from '@cat-supplies-store/contracts/email-job-id';
import { Queue } from 'bullmq';
import { EmailJobDraftsRepository } from './email-job-drafts.repository';
import {
  DRAFT_EMAIL_JOB,
  EMAIL_QUEUE,
  emailJobIdSchema,
  type EmailJobPayload,
} from '@cat-supplies-store/contracts';

const SUPPORT_ID = 'demo-support';

@Injectable()
export class EmailJobsService {
  constructor(
    @InjectQueue(EMAIL_QUEUE) private readonly queue: Queue<EmailJobPayload>,
    private readonly drafts: EmailJobDraftsRepository,
  ) {}

  async create(messageId: string) {
    const jobId = createEmailJobId(SUPPORT_ID, messageId);
    const existing = await this.drafts.findForRequester(jobId, SUPPORT_ID);
    if (existing) return { jobId };
    const job = await this.queue.add(
      DRAFT_EMAIL_JOB,
      { messageId, requesterId: SUPPORT_ID },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60 },
        removeOnFail: { age: 30 * 24 * 60 * 60 },
      },
    );
    return { jobId: job.id! };
  }

  async get(jobId: string) {
    if (!emailJobIdSchema.safeParse(jobId).success)
      throw new NotFoundException('Job not found.');
    const result = await this.drafts.findForRequester(jobId, SUPPORT_ID);
    if (result) return { jobId, status: 'completed' as const, result };
    const job = await this.queue.getJob(jobId);
    if (
      !job ||
      job.data.requesterId !== SUPPORT_ID ||
      job.name !== DRAFT_EMAIL_JOB
    ) {
      throw new NotFoundException('Job not found.');
    }
    const state = await job.getState();
    const status =
      state === 'completed'
        ? 'completed'
        : state === 'failed'
          ? 'failed'
          : state === 'active'
            ? 'processing'
            : 'pending';
    return { jobId, status };
  }
}
