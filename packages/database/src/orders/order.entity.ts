import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('orders')
export class OrderEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'text' })
  customer_id!: string;

  @Column({ type: 'text' })
  payment_id!: string;

  @Column({ type: 'text' })
  status!: string;

  @Column({ type: 'integer' })
  total_cents!: number;

  @Column({ type: 'text' })
  delivery_address!: string;

  @Column({ type: 'boolean' })
  refundable!: boolean;
}
