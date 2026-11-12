import type { QueryRunner } from 'typeorm';

export const migrationName = '005-conversations';
export async function up(client: QueryRunner): Promise<void> {
  await client.query(`
    CREATE TABLE conversations (
      id uuid PRIMARY KEY,
      customer_id text NOT NULL REFERENCES customers(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX conversations_customer_idx ON conversations(customer_id, created_at);
    CREATE TABLE conversation_turns (
      id uuid PRIMARY KEY,
      conversation_id uuid NOT NULL REFERENCES conversations(id),
      request_id uuid NOT NULL,
      sequence integer NOT NULL,
      kind text NOT NULL CHECK (kind IN ('message', 'approval')),
      input text NOT NULL,
      status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'interrupted')),
      model_messages jsonb NOT NULL DEFAULT '[]',
      ui_message jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      UNIQUE(conversation_id, request_id),
      UNIQUE(conversation_id, sequence)
    );
    CREATE UNIQUE INDEX conversation_running_turn_idx ON conversation_turns(conversation_id) WHERE status = 'running';
    CREATE TABLE conversation_tool_executions (
      turn_id uuid NOT NULL REFERENCES conversation_turns(id),
      tool_call_id text NOT NULL,
      name text NOT NULL,
      input jsonb NOT NULL,
      output jsonb,
      status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'unknown')),
      created_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      PRIMARY KEY(turn_id, tool_call_id)
    );
    CREATE TABLE conversation_approvals (
      confirmation_id uuid PRIMARY KEY,
      conversation_id uuid NOT NULL REFERENCES conversations(id),
      proposal jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'unknown')),
      turn_id uuid REFERENCES conversation_turns(id)
    );
  `);
}
