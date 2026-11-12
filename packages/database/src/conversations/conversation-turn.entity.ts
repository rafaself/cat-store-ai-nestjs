import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('conversation_turns')
export class ConversationTurnEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid') conversation_id!: string;
  @Column('uuid') request_id!: string;
  @Column('integer') sequence!: number;
  @Column('text') kind!: 'message' | 'approval';
  @Column('text') input!: string;
  @Column('text') status!: 'running' | 'completed' | 'failed' | 'interrupted';
  @Column('jsonb') model_messages!: unknown[];
  @Column('jsonb', { nullable: true }) ui_message!: unknown;
  @Column('timestamptz') created_at!: Date;
  @Column('timestamptz', { nullable: true }) finished_at!: Date | null;
}
