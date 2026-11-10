import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from '@llm-chatbot-nestjs/database';
import { OrdersRepository } from './orders.repository';
import { Module } from '@nestjs/common';
import { OrdersTools } from './orders.tools';
import { OrdersService } from './orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity])],
  providers: [OrdersRepository, OrdersService, OrdersTools],
  exports: [OrdersService],
})
export class OrdersModule {}
