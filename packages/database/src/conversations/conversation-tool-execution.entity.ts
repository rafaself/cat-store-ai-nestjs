import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('conversation_tool_executions')
export class ConversationToolExecutionEntity {
  @PrimaryColumn('uuid') turn_id!: string;
  @PrimaryColumn('text') tool_call_id!: string;
  @Column('text') name!: string;
  @Column('jsonb') input!: unknown;
  @Column('jsonb', { nullable: true }) output!: unknown;
  @Column('text') status!: 'running' | 'completed' | 'failed' | 'unknown';
  @Column('timestamptz') created_at!: Date;
  @Column('timestamptz', { nullable: true }) finished_at!: Date | null;
}
