import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { RepliesService } from './replies.service';
import { TriageService } from './triage.service';

@Module({
  providers: [TriageService, RepliesService, InvoicesService],
  exports: [TriageService, RepliesService, InvoicesService],
})
export class SupportModule {}
