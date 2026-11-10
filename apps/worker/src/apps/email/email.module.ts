import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EMAIL_QUEUE } from '@llm-chatbot-nestjs/contracts';
import { EmailDraftEntity } from '@llm-chatbot-nestjs/database';
import { EmailProcessor } from './email.processor';
import { MailpitService } from './mailpit.service';
import { TriageService } from './triage.service';
import { RepliesService } from './replies.service';
import { EMAIL_SOURCE } from './email-source';

@Module({
  imports: [
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
    TypeOrmModule.forFeature([EmailDraftEntity]),
  ],
  providers: [
    EmailProcessor,
    MailpitService,
    { provide: EMAIL_SOURCE, useExisting: MailpitService },
    TriageService,
    RepliesService,
  ],
})
export class EmailModule {}
