import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DRAFT_EMAIL_JOB,
  EMAIL_QUEUE,
  emailJobPayloadSchema,
} from '@llm-chatbot-nestjs/contracts';
import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { EmailDraftEntity } from '@llm-chatbot-nestjs/database';
import { EMAIL_SOURCE, type EmailSource } from './email-source';
import { TriageService } from './triage.service';
import { RepliesService } from './replies.service';

@Processor(EMAIL_QUEUE, { concurrency: 4 })
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);
  constructor(
    @InjectRepository(EmailDraftEntity)
    private readonly drafts: Repository<EmailDraftEntity>,
    @Inject(EMAIL_SOURCE) private readonly mailpit: EmailSource,
    private readonly triage: TriageService,
    private readonly replies: RepliesService,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== DRAFT_EMAIL_JOB) throw new Error('Unsupported email job.');
    const { messageId, requesterId } = emailJobPayloadSchema.parse(job.data);
    const expectedId = createHash('sha256')
      .update(requesterId)
      .update('\0')
      .update(messageId)
      .digest('hex');
    if (job.id !== expectedId) throw new Error('Invalid email job identity.');
    const existing = await this.drafts.findOne({
      where: { job_id: expectedId, requester_id: requesterId },
      select: { job_id: true },
    });
    if (existing) return;
    try {
      const message = await this.mailpit.read(messageId);
      const classification = await this.triage.triageEmail(message.text);
      const draft = await this.replies.draftReply(
        message.text,
        message.senderName,
      );
      await this.drafts.manager.query(
        `INSERT INTO email_drafts (job_id, requester_id, message_id, subject, sender, classification, draft)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) ON CONFLICT (requester_id, message_id) DO NOTHING`,
        [
          expectedId,
          requesterId,
          messageId,
          message.subject,
          message.sender,
          JSON.stringify(classification),
          draft,
        ],
      );
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
