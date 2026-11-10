import { Injectable } from '@nestjs/common';
import {
  OrdersRepository,
  type CustomerOrder,
} from '@llm-chatbot-nestjs/database';

export type OrderRecord = CustomerOrder;

@Injectable()
export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  async findForCustomer(
    customerId: string,
    orderId: string,
  ): Promise<OrderRecord | null> {
    return this.orders.findForCustomer(customerId, orderId);
  }

  async changeAddress(
    customerId: string,
    orderId: string,
    address: string,
  ): Promise<OrderRecord | null> {
    return this.orders.changeAddress(customerId, orderId, address);
  }
}
