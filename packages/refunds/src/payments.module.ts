import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from '@cat-supplies-store/database';
import { PaymentsRepository } from './payments.repository.js';
import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentEntity])],
  providers: [PaymentsRepository, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
