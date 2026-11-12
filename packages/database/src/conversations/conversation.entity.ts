import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('conversations')
export class ConversationEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('text') customer_id!: string;
  @Column('timestamptz') created_at!: Date;
}
