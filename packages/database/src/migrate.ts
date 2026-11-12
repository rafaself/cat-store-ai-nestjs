import type { DataSource } from 'typeorm';
import * as initial from './migrations/001-initial-schema.js';
import * as emailDrafts from './migrations/002-email-drafts.js';
import * as addressConfirmations from './migrations/003-address-change-confirmations.js';
import * as conversationApprovalIndex from './migrations/006-conversation-approval-index.js';
import * as conversations from './migrations/005-conversations.js';
import * as oneRefundPerPayment from './migrations/004-one-refund-per-payment.js';

export async function migrateDatabase(dataSource: DataSource): Promise<void> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    await runner.startTransaction();
    await runner.query('SELECT pg_advisory_xact_lock($1)', [824_031_122]);
    await runner.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const migration of [
      initial,
      emailDrafts,
      addressConfirmations,
      oneRefundPerPayment,
      conversations,
      conversationApprovalIndex,
    ]) {
      const applied = await runner.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [migration.migrationName],
      );
      if (!applied.length) {
        await migration.up(runner);
        await runner.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
          migration.migrationName,
        ]);
      }
    }
    await runner.commitTransaction();
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}
