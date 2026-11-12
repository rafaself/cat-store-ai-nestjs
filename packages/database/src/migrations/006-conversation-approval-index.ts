import type { QueryRunner } from 'typeorm';

export const migrationName = '006-conversation-approval-index';
export async function up(client: QueryRunner): Promise<void> {
  await client.query(`
    CREATE INDEX conversation_approvals_conversation_status_idx
    ON conversation_approvals(conversation_id, status)
  `);
}
