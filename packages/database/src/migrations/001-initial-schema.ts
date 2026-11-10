import type { QueryRunner } from 'typeorm';

export const migrationName = '001-initial-schema';

export async function up(client: QueryRunner): Promise<void> {
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS customers (
      id text PRIMARY KEY,
      name text NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id text PRIMARY KEY,
      amount_cents integer NOT NULL CHECK (amount_cents > 0),
      refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
      status text NOT NULL CHECK (status IN ('captured', 'partially_refunded', 'refunded'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id text PRIMARY KEY,
      customer_id text NOT NULL REFERENCES customers(id),
      payment_id text NOT NULL UNIQUE REFERENCES payments(id),
      status text NOT NULL,
      total_cents integer NOT NULL CHECK (total_cents > 0),
      delivery_address text NOT NULL,
      refundable boolean NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS products (
      id text PRIMARY KEY,
      name text NOT NULL,
      description text NOT NULL,
      price_cents integer NOT NULL CHECK (price_cents >= 0),
      embedding vector(1024)
    );

    CREATE TABLE IF NOT EXISTS payment_refunds (
      idempotency_key text PRIMARY KEY,
      payment_id text NOT NULL REFERENCES payments(id),
      amount_cents integer NOT NULL CHECK (amount_cents > 0),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS products_embedding_cosine_idx
      ON products USING hnsw (embedding vector_cosine_ops)
      WHERE embedding IS NOT NULL;
  `);

  await client.query(`
    INSERT INTO customers (id, name) VALUES
      ('cus_123', 'Demo Customer'), ('cus_456', 'Other Customer')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO payments (id, amount_cents, status) VALUES
      ('pay_123', 4599, 'captured'), ('pay_124', 1799, 'captured'),
      ('pay_125', 2500, 'captured'),
      ('pay_456', 2999, 'captured')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO orders (id, customer_id, payment_id, status, total_cents, delivery_address, refundable) VALUES
      ('ord_123', 'cus_123', 'pay_123', 'delivered', 4599, '123 Demo Street, São Paulo', true),
      ('ord_124', 'cus_123', 'pay_124', 'delivered', 1799, '123 Demo Street, São Paulo', true),
      ('ord_125', 'cus_123', 'pay_125', 'processing', 2500, '123 Demo Street, São Paulo', false),
      ('ord_456', 'cus_456', 'pay_456', 'processing', 2999, '456 Sample Avenue, São Paulo', false)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO products (id, name, description, price_cents) VALUES
      ('prod_sensitive', 'Sensitive Stomach Salmon', 'Gentle salmon food for cats with sensitive digestion.', 3299),
      ('prod_appetite', 'Gentle Appetite Support', 'A palatable wet food that can help picky eaters enjoy mealtime.', 1899),
      ('prod_toy', 'Feather Chase Wand', 'An interactive feather wand toy for active indoor cats.', 1299),
      ('prod_litter', 'Low Dust Clumping Litter', 'Unscented clumping litter designed to reduce dust around the home.', 2199),
      ('prod_dental', 'Dental Care Bites', 'Crunchy treats that help support everyday dental hygiene.', 999)
    ON CONFLICT (id) DO NOTHING;
  `);
}
