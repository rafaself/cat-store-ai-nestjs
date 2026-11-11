import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from '@cat-supplies-store/database';
import { RepositoryDatabase } from '../../database/repository-database';

export interface CustomerOrder {
  id: string;
  status: string;
  totalCents: number;
  deliveryAddress: string;
  refundable: boolean;
}

@Injectable()
export class OrdersRepository {
  private readonly database: RepositoryDatabase;

  constructor(
    @InjectRepository(OrderEntity)
    private readonly repository: Repository<OrderEntity>,
  ) {
    this.database = new RepositoryDatabase(this.repository.manager);
  }

  async findForCustomer(
    customerId: string,
    orderId: string,
  ): Promise<CustomerOrder | null> {
    const order = await this.repository.findOne({
      where: { id: orderId, customer_id: customerId },
      select: {
        id: true,
        status: true,
        total_cents: true,
        delivery_address: true,
        refundable: true,
      },
    });
    return toCustomerOrder(order);
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
    | undefined
    | null,
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
