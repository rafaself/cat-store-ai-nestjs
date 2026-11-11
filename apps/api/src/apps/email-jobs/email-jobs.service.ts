import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { createEmailJobId } from '@cat-supplies-store/contracts/email-job-id';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { EmailDraftEntity } from '@cat-supplies-store/database';
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
    @InjectRepository(EmailDraftEntity)
    private readonly drafts: Repository<EmailDraftEntity>,
  ) {}

  async create(messageId: string) {
    const jobId = createEmailJobId(SUPPORT_ID, messageId);
    const existing = await this.findDraft(jobId);
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
    const result = await this.findDraft(jobId);
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

  private async findDraft(jobId: string) {
    const row = await this.drafts.findOne({
      where: { job_id: jobId, requester_id: SUPPORT_ID },
      select: {
        subject: true,
        sender: true,
        classification: true,
        draft: true,
      },
    });
    return (
      row && {
        subject: row.subject,
        sender: row.sender,
        classification: row.classification,
        draft: row.draft,
      }
    );
  }
}
