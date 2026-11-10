import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('customers')
export class CustomerEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'text' })
  name!: string;
}
