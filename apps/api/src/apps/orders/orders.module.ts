import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from '@cat-supplies-store/database';
import { OrdersRepository } from './orders.repository';
import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity])],
  providers: [OrdersRepository, OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
