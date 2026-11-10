import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from '@llm-chatbot-nestjs/database';
import { PaymentsRepository } from './payments.repository';
import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentEntity])],
  providers: [PaymentsRepository, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
