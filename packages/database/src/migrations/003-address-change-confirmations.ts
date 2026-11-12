import type { QueryRunner } from 'typeorm';

export const migrationName = '003-address-change-confirmations';

export async function up(client: QueryRunner): Promise<void> {
  await client.query(`
    CREATE TABLE address_change_confirmations (
      id uuid PRIMARY KEY,
      customer_id text NOT NULL REFERENCES customers(id),
      order_id text NOT NULL REFERENCES orders(id),
      address text NOT NULL,
      expires_at timestamptz NOT NULL,
      approved_at timestamptz
    );
  `);
}
