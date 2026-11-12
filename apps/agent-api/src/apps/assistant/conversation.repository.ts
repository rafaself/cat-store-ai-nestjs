import {
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import type { ModelMessage, UIMessage } from 'ai';
import { addressChangeProposalSchema } from '@cat-supplies-store/contracts';

export type TurnStatus = 'running' | 'completed' | 'failed' | 'interrupted';
export interface ConversationTurn {
  id: string;
  conversation_id: string;
  request_id: string;
  sequence: number;
  kind: 'message' | 'approval';
  input: string;
  status: TurnStatus;
  model_messages: ModelMessage[];
  ui_message: UIMessage | null;
}
export interface ToolExecution {
  turn_id: string;
  tool_call_id: string;
  name: string;
  input: unknown;
  output: unknown;
  status: 'running' | 'completed' | 'failed' | 'unknown';
}
export interface ConversationSession {
  runner: QueryRunner;
  conversationId: string;
  release(): Promise<void>;
}

@Injectable()
export class ConversationRepository {
  constructor(private readonly database: DataSource) {}

  async create(customerId: string) {
    const id = randomUUID();
    await this.database.query(
      'INSERT INTO conversations(id, customer_id) VALUES ($1, $2)',
      [id, customerId],
    );
    return { id };
  }

  list(customerId: string): Promise<{ id: string; created_at: Date }[]> {
    return this.database.query(
      'SELECT id, created_at FROM conversations WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50',
      [customerId],
    );
  }

  async assertOwner(conversationId: string, customerId: string) {
    const rows = await this.database.query(
      'SELECT id FROM conversations WHERE id = $1 AND customer_id = $2',
      [conversationId, customerId],
    );
    if (!rows.length) throw new NotFoundException('Conversation not found.');
  }

  // A session lock holds a connection, never an open transaction during generation.
  // A process crash releases it; the next owner marks unfinished work interrupted.
  async acquire(
    conversationId: string,
    customerId: string,
  ): Promise<ConversationSession> {
    await this.assertOwner(conversationId, customerId);
    const runner = this.database.createQueryRunner();
    await runner.connect();
    try {
      const [row] = await runner.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 91827)) AS locked',
        [conversationId],
      );
      if (!row.locked)
        throw new ConflictException('A conversation turn is already active.');
    } catch (error) {
      await runner.release();
      throw error;
    }
    const session = {
      runner,
      conversationId,
      release: async () => {
        try {
          await runner.query(
            'SELECT pg_advisory_unlock(hashtextextended($1, 91827))',
            [conversationId],
          );
        } finally {
          await runner.release();
        }
      },
    };
    try {
      await this.recover(session);
      return session;
    } catch (error) {
      await session.release();
      throw error;
    }
  }

  private async recover({ runner, conversationId }: ConversationSession) {
    await runner.startTransaction();
    try {
      await runner.query(
        `UPDATE conversation_tool_executions SET status = 'unknown', finished_at = now()
        WHERE status = 'running' AND turn_id IN (SELECT id FROM conversation_turns WHERE conversation_id = $1 AND status = 'running')`,
        [conversationId],
      );
      await runner.query(
        `UPDATE conversation_approvals SET status = 'unknown' WHERE conversation_id = $1 AND status = 'executing'`,
        [conversationId],
      );
      await runner.query(
        `UPDATE conversation_turns SET status = 'interrupted', finished_at = now() WHERE conversation_id = $1 AND status = 'running'`,
        [conversationId],
      );
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    }
  }

  turns(
    conversationId: string,
    runner?: QueryRunner,
  ): Promise<ConversationTurn[]> {
    return (runner ?? this.database).query(
      'SELECT * FROM conversation_turns WHERE conversation_id = $1 ORDER BY sequence',
      [conversationId],
    );
  }
  tools(
    conversationId: string,
    runner?: QueryRunner,
  ): Promise<ToolExecution[]> {
    return (runner ?? this.database).query(
      `SELECT e.* FROM conversation_tool_executions e JOIN conversation_turns t ON t.id = e.turn_id WHERE t.conversation_id = $1 ORDER BY t.sequence, e.created_at, e.tool_call_id`,
      [conversationId],
    );
  }
  approvals(
    conversationId: string,
  ): Promise<{ confirmationId: string; status: string }[]> {
    return this.database.query(
      'SELECT confirmation_id AS "confirmationId", status FROM conversation_approvals WHERE conversation_id = $1',
      [conversationId],
    );
  }
  async begin(
    session: ConversationSession,
    requestId: string,
    input: string,
    kind: ConversationTurn['kind'],
  ) {
    const turns = await this.turns(session.conversationId, session.runner);
    const previous = turns.find((turn) => turn.request_id === requestId);
    if (previous) {
      if (previous.input !== input || previous.kind !== kind)
        throw new ConflictException(
          'Request ID was already used for different input.',
        );
      return { turn: previous, duplicate: true, history: turns };
    }
    if (
      kind === 'message' &&
      turns.filter((turn) => turn.kind === 'message').length >= 40
    ) {
      throw new PayloadTooLargeException(
        'Conversation is full. Start a new conversation.',
      );
    }
    const [turn] = await session.runner.query(
      `INSERT INTO conversation_turns(id, conversation_id, request_id, sequence, kind, input, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'running') RETURNING *`,
      [
        randomUUID(),
        session.conversationId,
        requestId,
        turns.length + 1,
        kind,
        input,
      ],
    );
    return { turn: turn as ConversationTurn, duplicate: false, history: turns };
  }

  async finish(
    session: ConversationSession,
    turnId: string,
    status: TurnStatus,
    messages: ModelMessage[],
    ui: UIMessage,
  ) {
    await session.runner.query(
      `WITH unfinished AS (UPDATE conversation_tool_executions SET status = 'unknown', finished_at = now() WHERE turn_id = $1 AND status = 'running') UPDATE conversation_turns SET status = $2, model_messages = $3::jsonb, ui_message = $4::jsonb, finished_at = now() WHERE id = $1 AND status = 'running'`,
      [turnId, status, JSON.stringify(messages), JSON.stringify(ui)],
    );
  }

  async executeTool<T>(
    session: ConversationSession,
    turnId: string,
    callId: string,
    name: string,
    input: unknown,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous: (ToolExecution & { same_input: boolean })[] =
      await session.runner.query(
        'SELECT *, input = $3::jsonb AS same_input FROM conversation_tool_executions WHERE turn_id = $1 AND tool_call_id = $2',
        [turnId, callId, JSON.stringify(input)],
      );
    if (previous[0]) {
      if (
        previous[0].name !== name ||
        !previous[0].same_input ||
        previous[0].status !== 'completed'
      )
        throw new ConflictException('Tool execution cannot be repeated.');
      return previous[0].output as T;
    }
    await session.runner.query(
      `INSERT INTO conversation_tool_executions(turn_id, tool_call_id, name, input, status) VALUES ($1, $2, $3, $4::jsonb, 'running')`,
      [turnId, callId, name, JSON.stringify(input)],
    );
    let output: T;
    try {
      output = await operation();
    } catch (error) {
      const status =
        error instanceof HttpException &&
        [400, 401, 403, 404, 429].includes(error.getStatus())
          ? 'failed'
          : 'unknown';
      await session.runner.query(
        `UPDATE conversation_tool_executions SET status = $3, finished_at = now() WHERE turn_id = $1 AND tool_call_id = $2`,
        [turnId, callId, status],
      );
      throw error;
    }
    // Never report success to the model before the operation result is durable.
    const proposal = addressChangeProposalSchema.safeParse(output);
    if (name === 'change-address' && proposal.success) {
      await session.runner.query(
        `WITH saved AS (
        UPDATE conversation_tool_executions SET status = 'completed', output = $3::jsonb, finished_at = now()
        WHERE turn_id = $1 AND tool_call_id = $2 RETURNING turn_id
      ) INSERT INTO conversation_approvals(confirmation_id, conversation_id, proposal)
        SELECT $4, $5, $3::jsonb FROM saved ON CONFLICT DO NOTHING`,
        [
          turnId,
          callId,
          JSON.stringify(output),
          proposal.data.confirmationId,
          session.conversationId,
        ],
      );
    } else {
      await session.runner.query(
        `UPDATE conversation_tool_executions SET status = 'completed', output = $3::jsonb, finished_at = now() WHERE turn_id = $1 AND tool_call_id = $2`,
        [turnId, callId, JSON.stringify(output)],
      );
    }
    return output;
  }
}
