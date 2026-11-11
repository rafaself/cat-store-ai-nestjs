import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailDraftEntity } from '@cat-supplies-store/database';

@Injectable()
export class EmailJobDraftsRepository {
  constructor(
    @InjectRepository(EmailDraftEntity)
    private readonly drafts: Repository<EmailDraftEntity>,
  ) {}

  async findForRequester(jobId: string, requesterId: string) {
    const row = await this.drafts.findOne({
      where: { job_id: jobId, requester_id: requesterId },
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
