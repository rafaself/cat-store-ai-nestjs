import type { QueryRunner } from 'typeorm';

export const migrationName = '004-one-refund-per-payment';

export async function up(client: QueryRunner): Promise<void> {
  await client.query(`
    ALTER TABLE payment_refunds
      ADD CONSTRAINT payment_refunds_payment_id_key UNIQUE (payment_id);
  `);
}
