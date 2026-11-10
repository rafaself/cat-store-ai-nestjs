import { Module } from '@nestjs/common';
import { OrdersTools } from './orders.tools';
import { OrdersService } from './orders.service';

@Module({
  providers: [OrdersService, OrdersTools],
  exports: [OrdersService],
})
export class OrdersModule {}
