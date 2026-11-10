import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('payments')
export class PaymentEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'integer' })
  amount_cents!: number;

  @Column({ type: 'integer' })
  refunded_cents!: number;

  @Column({ type: 'text' })
  status!: string;
}
