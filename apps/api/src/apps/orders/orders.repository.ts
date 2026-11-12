import { ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AddressChangeConfirmationEntity,
  OrderEntity,
} from '@cat-supplies-store/database';
import type { CustomerOrder } from '@cat-supplies-store/contracts';

export type { CustomerOrder } from '@cat-supplies-store/contracts';

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
    confirmationId: string,
  ): Promise<CustomerOrder | null> {
    return this.repository.manager.transaction(async (manager) => {
      const confirmations = manager.getRepository(
        AddressChangeConfirmationEntity,
      );
      const confirmation = await confirmations
        .createQueryBuilder('confirmation')
        .setLock('pessimistic_write')
        .where({
          id: confirmationId,
          customer_id: customerId,
          order_id: orderId,
          address,
        })
        .andWhere('expires_at > CURRENT_TIMESTAMP')
        .andWhere('approved_at IS NOT NULL')
        .getOne();
      if (!confirmation)
        throw new ForbiddenException(
          'A valid, unused address confirmation is required.',
        );
      const result = await manager
        .getRepository(OrderEntity)
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
      if (orders[0]) {
        const consumed = await confirmations
          .createQueryBuilder()
          .delete()
          .where({ id: confirmation.id })
          .andWhere('expires_at > clock_timestamp()')
          .execute();
        if (consumed.affected !== 1)
          throw new ForbiddenException('Address confirmation expired.');
      }
      return toCustomerOrder(orders[0]);
    });
  }

  async proposeAddressChange(
    customerId: string,
    orderId: string,
    address: string,
  ) {
    // Use the database clock and persist across API replicas/restarts.
    const rows = await this.repository.query<AddressChangeConfirmationEntity[]>(
      `INSERT INTO address_change_confirmations (id, customer_id, order_id, address, expires_at)
       SELECT $1, customer_id, id, $4, CURRENT_TIMESTAMP + interval '5 minutes'
       FROM orders WHERE id = $3 AND customer_id = $2 AND status IN ('pending', 'processing')
       RETURNING *`,
      [randomUUID(), customerId, orderId, address],
    );
    const proposal = rows[0];
    return proposal
      ? {
          status: 'confirmation-required' as const,
          confirmationId: proposal.id,
          orderId: proposal.order_id,
          address: proposal.address,
          expiresAt: proposal.expires_at.toISOString(),
        }
      : null;
  }

  async approveAddressChange(
    customerId: string,
    confirmationId: string,
    orderId: string,
    address: string,
  ): Promise<boolean> {
    const result = await this.repository.manager
      .getRepository(AddressChangeConfirmationEntity)
      .createQueryBuilder()
      .update()
      .set({ approved_at: () => 'CURRENT_TIMESTAMP' })
      .where({
        id: confirmationId,
        customer_id: customerId,
        order_id: orderId,
        address,
      })
      .andWhere('expires_at > CURRENT_TIMESTAMP AND approved_at IS NULL')
      .execute();
    return result.affected === 1;
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
