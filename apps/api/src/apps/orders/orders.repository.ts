import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from '@cat-supplies-store/database';

export interface CustomerOrder {
  id: string;
  status: string;
  totalCents: number;
  deliveryAddress: string;
  refundable: boolean;
}

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly repository: Repository<OrderEntity>,
  ) {}

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
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ delivery_address: address })
      .where({ id: orderId, customer_id: customerId })
      .andWhere('status IN (:...statuses)', {
        statuses: ['pending', 'processing'],
      })
      .returning([
        'id',
        'status',
        'total_cents',
        'delivery_address',
        'refundable',
      ])
      .execute();
    const orders = result.raw as OrderEntity[];
    return toCustomerOrder(orders[0]);
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
