import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentEntity } from '@cat-supplies-store/database';
import { RepositoryDatabase } from '../../database/repository-database';
import type {
  OrderEntity,
  PaymentRefundEntity,
} from '@cat-supplies-store/database';

export interface PersistedRefund {
  paymentId: string;
  amountCents: number;
  idempotencyKey: string;
}

export type RefundPersistenceResult =
  | { status: 'success'; refund: PersistedRefund }
  | { status: 'not_found' | 'idempotency_conflict' | 'ineligible' };

@Injectable()
export class PaymentsRepository {
  private readonly database: RepositoryDatabase;

  constructor(
    @InjectRepository(PaymentEntity) repository: Repository<PaymentEntity>,
  ) {
    this.database = new RepositoryDatabase(repository.manager);
  }

  refundOrder(
    customerId: string,
    orderId: string,
    idempotencyKey: string,
  ): Promise<RefundPersistenceResult> {
    return this.database.transaction(async (client) => {
      const orderResult = await client.query<
        Pick<
          OrderEntity,
          'payment_id' | 'total_cents' | 'refundable' | 'status'
        > &
          Pick<PaymentEntity, 'amount_cents' | 'refunded_cents'>
      >(
        `SELECT o.payment_id, o.total_cents, o.refundable, o.status AS status,
                p.amount_cents, p.refunded_cents
         FROM orders o JOIN payments p ON p.id = o.payment_id
         WHERE o.id = $1 AND o.customer_id = $2
         FOR UPDATE OF o, p`,
        [orderId, customerId],
      );
      const order = orderResult.rows[0];
      if (!order) return { status: 'not_found' };

      const previous = await client.query<
        Pick<PaymentRefundEntity, 'payment_id' | 'amount_cents'>
      >(
        'SELECT payment_id, amount_cents FROM payment_refunds WHERE idempotency_key = $1',
        [idempotencyKey],
      );
      const priorRefund = previous.rows[0];
      if (priorRefund) {
        if (
          priorRefund.payment_id !== order.payment_id ||
          priorRefund.amount_cents !== order.total_cents
        ) {
          return { status: 'idempotency_conflict' };
        }
        return {
          status: 'success',
          refund: {
            paymentId: priorRefund.payment_id,
            amountCents: priorRefund.amount_cents,
            idempotencyKey,
          },
        };
      }

      if (
        !order.refundable ||
        order.status !== 'delivered' ||
        order.refunded_cents + order.total_cents > order.amount_cents
      ) {
        return { status: 'ineligible' };
      }

      await client.query(
        `INSERT INTO payment_refunds (idempotency_key, payment_id, amount_cents)
         VALUES ($1, $2, $3)`,
        [idempotencyKey, order.payment_id, order.total_cents],
      );
      const refundedCents = order.refunded_cents + order.total_cents;
      await client.query(
        `UPDATE payments SET refunded_cents = $2,
          status = CASE WHEN $2 >= amount_cents THEN 'refunded' ELSE 'partially_refunded' END
         WHERE id = $1`,
        [order.payment_id, refundedCents],
      );

      return {
        status: 'success',
        refund: {
          paymentId: order.payment_id,
          amountCents: order.total_cents,
          idempotencyKey,
        },
      };
    });
  }
}
