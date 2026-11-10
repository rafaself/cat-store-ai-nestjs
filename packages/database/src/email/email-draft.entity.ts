import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('email_drafts')
export class EmailDraftEntity {
  @PrimaryColumn({ type: 'text' })
  job_id!: string;

  @Column({ type: 'text' })
  requester_id!: string;

  @Column({ type: 'text' })
  message_id!: string;

  @Column({ type: 'text' })
  subject!: string;

  @Column({ type: 'text' })
  sender!: string;

  @Column({ type: 'jsonb' })
  classification!: unknown;

  @Column({ type: 'text' })
  draft!: string;

  @Column({ type: 'timestamptz' })
  created_at!: Date;
}
