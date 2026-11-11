import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailDraftEntity } from '@cat-supplies-store/database';
import type { EmailClassification } from '@cat-supplies-store/contracts';

interface EmailDraft {
  jobId: string;
  requesterId: string;
  messageId: string;
  subject: string;
  sender: string;
  classification: EmailClassification;
  draft: string;
}

@Injectable()
export class EmailDraftsRepository {
  constructor(
    @InjectRepository(EmailDraftEntity)
    private readonly drafts: Repository<EmailDraftEntity>,
  ) {}

  async exists(jobId: string, requesterId: string): Promise<boolean> {
    const existing = await this.drafts.findOne({
      where: { job_id: jobId, requester_id: requesterId },
      select: { job_id: true },
    });
    return existing !== null;
  }

  async save(draft: EmailDraft): Promise<void> {
    await this.drafts.manager.query(
      `INSERT INTO email_drafts (job_id, requester_id, message_id, subject, sender, classification, draft)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) ON CONFLICT (requester_id, message_id) DO NOTHING`,
      [
        draft.jobId,
        draft.requesterId,
        draft.messageId,
        draft.subject,
        draft.sender,
        JSON.stringify(draft.classification),
        draft.draft,
      ],
    );
  }
}
