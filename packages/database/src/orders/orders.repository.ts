import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import type { OrderEntity } from './order.entity.js';

export interface CustomerOrder {
  id: string;
  status: string;
  totalCents: number;
  deliveryAddress: string;
  refundable: boolean;
}

@Injectable()
export class OrdersRepository {
  constructor(private readonly database: DatabaseService) {}

  async findForCustomer(
    customerId: string,
    orderId: string,
  ): Promise<CustomerOrder | null> {
    const result = await this.database.query<
      Pick<
        OrderEntity,
        'id' | 'status' | 'total_cents' | 'delivery_address' | 'refundable'
      >
    >(
      `SELECT id, status, total_cents, delivery_address, refundable
       FROM orders WHERE id = $1 AND customer_id = $2`,
      [orderId, customerId],
    );
    return toCustomerOrder(result.rows[0]);
  }

  async changeAddress(
    customerId: string,
    orderId: string,
    address: string,
  ): Promise<CustomerOrder | null> {
    const result = await this.database.query<
      Pick<
        OrderEntity,
        'id' | 'status' | 'total_cents' | 'delivery_address' | 'refundable'
      >
    >(
      `UPDATE orders SET delivery_address = $3
       WHERE id = $1 AND customer_id = $2 AND status IN ('pending', 'processing')
       RETURNING id, status, total_cents, delivery_address, refundable`,
      [orderId, customerId, address],
    );
    return toCustomerOrder(result.rows[0]);
  }
}

function toCustomerOrder(
  order:
    | Pick<
        OrderEntity,
        'id' | 'status' | 'total_cents' | 'delivery_address' | 'refundable'
      >
    | undefined,
): CustomerOrder | null {
  return order
    ? {
        id: order.id,
        status: order.status,
        totalCents: order.total_cents,
        deliveryAddress: order.delivery_address,
        refundable: order.refundable,
      }
    : null;
}
