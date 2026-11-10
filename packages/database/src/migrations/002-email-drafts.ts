import type { QueryRunner } from 'typeorm';

export const migrationName = '002-email-drafts';

export async function up(client: QueryRunner): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS email_drafts (
      job_id text PRIMARY KEY,
      requester_id text NOT NULL,
      message_id text NOT NULL,
      subject text NOT NULL,
      sender text NOT NULL,
      classification jsonb NOT NULL,
      draft text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (requester_id, message_id)
    )
  `);
}
