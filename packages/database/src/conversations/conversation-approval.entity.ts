import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('conversation_approvals')
export class ConversationApprovalEntity {
  @PrimaryColumn('uuid') confirmation_id!: string;
  @Column('uuid') conversation_id!: string;
  @Column('jsonb') proposal!: unknown;
  @Column('text') status!:
    'pending' | 'executing' | 'completed' | 'failed' | 'unknown';
  @Column('uuid', { nullable: true }) turn_id!: string | null;
}
