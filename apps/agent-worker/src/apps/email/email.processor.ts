import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import {
  DRAFT_EMAIL_JOB,
  EMAIL_QUEUE,
  emailJobPayloadSchema,
} from '@cat-supplies-store/contracts';
import { createEmailJobId } from '@cat-supplies-store/contracts/email-job-id';
import { EmailDraftsRepository } from './email-drafts.repository';
import { EMAIL_SOURCE, type EmailSource } from './email-source';
import { TriageService } from './triage.service';
import { RepliesService } from './replies.service';
import type { Job } from 'bullmq';

@Processor(EMAIL_QUEUE, { concurrency: 4 })
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);
  constructor(
    private readonly drafts: EmailDraftsRepository,
    @Inject(EMAIL_SOURCE) private readonly source: EmailSource,
    private readonly triage: TriageService,
    private readonly replies: RepliesService,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== DRAFT_EMAIL_JOB) throw new Error('Unsupported email job.');

    const { messageId, requesterId } = emailJobPayloadSchema.parse(job.data);
    const expectedId = createEmailJobId(requesterId, messageId);

    if (job.id !== expectedId) throw new Error('Invalid email job identity.');

    try {
      if (await this.drafts.exists(expectedId, requesterId)) return;

      const message = await this.source.read(messageId);
      const classification = await this.triage.triageEmail(message.text);
      const draft = await this.replies.draftReply(
        message.text,
        message.senderName,
      );

      await this.drafts.save({
        jobId: expectedId,
        requesterId,
        messageId,
        subject: message.subject,
        sender: message.sender,
        classification,
        draft,
      });
    } catch {
      // Queue failures are persisted, so keep message contents and provider errors out of Redis.
      throw new Error('Email job processing failed.');
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<unknown> | undefined): void {
    this.logger.warn(
      `Email job ${job?.id ?? 'unknown'} failed; attempts: ${job?.attemptsMade ?? 0}.`,
    );
  }
}
