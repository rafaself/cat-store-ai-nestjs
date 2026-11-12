import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('address_change_confirmations')
export class AddressChangeConfirmationEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('text') customer_id!: string;
  @Column('text') order_id!: string;
  @Column('text') address!: string;
  @Column('timestamptz') expires_at!: Date;
  @Column('timestamptz', { nullable: true }) approved_at!: Date | null;
}
