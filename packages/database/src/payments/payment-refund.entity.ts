import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

@Entity('payment_refunds')
@Unique('payment_refunds_payment_id_key', ['payment_id'])
export class PaymentRefundEntity {
  @PrimaryColumn({ type: 'text' })
  idempotency_key!: string;

  @Column({ type: 'text' })
  payment_id!: string;

  @Column({ type: 'integer' })
  amount_cents!: number;

  @Column({ type: 'timestamptz' })
  created_at!: Date;
}
