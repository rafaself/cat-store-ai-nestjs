import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('payment_refunds')
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
