import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EMAIL_QUEUE } from '@llm-chatbot-nestjs/contracts';
import { EmailDraftEntity } from '@llm-chatbot-nestjs/database';
import { SupportApprovalGuard } from '../../auth/demo-auth.guard';
import { EmailJobsController } from './email-jobs.controller';
import { EmailJobsService } from './email-jobs.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
    TypeOrmModule.forFeature([EmailDraftEntity]),
  ],
  controllers: [EmailJobsController],
  providers: [EmailJobsService, SupportApprovalGuard],
})
export class EmailJobsModule {}
