import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import type { PoolClient } from 'pg';
import type { ModelMessage, UIMessage } from 'ai';
import { addressChangeProposalSchema } from '@cat-supplies-store/contracts';

export type TurnStatus = 'running' | 'completed' | 'failed' | 'interrupted';
export type TerminalTurnStatus = Exclude<TurnStatus, 'running'>;
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
  signal: AbortSignal;
  release(originalError?: unknown): Promise<void>;
}

@Injectable()
export class ConversationRepository {
  private readonly logger = new Logger(ConversationRepository.name);
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
    let client: PoolClient;
    try {
      client = await runner.connect();
    } catch (error) {
      await runner.release();
      throw error;
    }
    const lost = new AbortController();
    const onLoss = () =>
      lost.abort(new Error('Conversation database session ended.'));
    client.on('error', onLoss);
    client.on('end', onLoss);
    let locked = false;
    let lockAttempted = false;
    let releasing: Promise<void> | undefined;
    const session: ConversationSession = {
      runner,
      conversationId,
      signal: lost.signal,
      release: (originalError?: unknown) =>
        (releasing ??= (async () => {
          try {
            if (runner.isReleased) {
              if (!lost.signal.aborted)
                throw new Error(
                  'Conversation runner was released before cleanup.',
                );
            } else {
              if (runner.isTransactionActive)
                await runner.rollbackTransaction();
              if (locked) {
                const [row] = await runner.query(
                  'SELECT pg_advisory_unlock(hashtextextended($1, 91827)) AS unlocked',
                  [conversationId],
                );
                if (!row.unlocked)
                  throw new Error('Conversation lock was not held.');
              } else if (lockAttempted) {
                // Acquisition may have succeeded before its response was lost.
                await client.end();
              }
            }
          } catch (error) {
            this.logger.error(
              'Conversation session cleanup failed; closing the connection.',
              error,
            );
            // pg-pool discards ended clients on release. Never return an uncertain
            // session lock or transaction to the pool, and do not use private ORM APIs.
            try {
              await client.end();
            } catch (closeError) {
              this.logger.error(
                'Failed to close the PostgreSQL client.',
                closeError,
              );
            }
            throw originalError ?? error;
          } finally {
            client.removeListener('error', onLoss);
            client.removeListener('end', onLoss);
            await runner.release();
          }
        })()),
    };
    try {
      lockAttempted = true;
      const [row] = await runner.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 91827)) AS locked',
        [conversationId],
      );
      locked = row.locked;
      lockAttempted = locked;
      if (!locked)
        throw new ConflictException('A conversation turn is already active.');
      await this.recover(session);
      return session;
    } catch (error) {
      try {
        await session.release(error);
      } catch (cleanupError) {
        this.logger.error(
          'Failed to release a rejected conversation session.',
          cleanupError,
        );
      }
      throw error;
    }
  }

  private async recover({ runner, conversationId }: ConversationSession) {
    await runner.startTransaction();
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
    // On failure, acquire() invokes session cleanup to roll back or discard.
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
  async snapshot(
    conversationId: string,
    customerId: string,
  ): Promise<{
    turns: ConversationTurn[];
    tools: ToolExecution[];
    approvals: { confirmationId: string; status: string }[];
  }> {
    const [row] = await this.database.query(
      `
      SELECT
        COALESCE((SELECT jsonb_agg(t ORDER BY t.sequence)
          FROM conversation_turns t WHERE t.conversation_id = c.id), '[]'::jsonb) AS turns,
        COALESCE((SELECT jsonb_agg(e ORDER BY t.sequence, e.created_at, e.tool_call_id)
          FROM conversation_tool_executions e JOIN conversation_turns t ON t.id = e.turn_id
          WHERE t.conversation_id = c.id), '[]'::jsonb) AS tools,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('confirmationId', a.confirmation_id, 'status', a.status))
          FROM conversation_approvals a WHERE a.conversation_id = c.id), '[]'::jsonb) AS approvals
      FROM conversations c WHERE c.id = $1 AND c.customer_id = $2`,
      [conversationId, customerId],
    );
    if (!row) throw new NotFoundException('Conversation not found.');
    return row;
  }

  async previous(
    session: ConversationSession,
    requestId: string,
    input: string,
    kind: ConversationTurn['kind'],
  ) {
    const [previous]: ConversationTurn[] = await session.runner.query(
      'SELECT * FROM conversation_turns WHERE conversation_id = $1 AND request_id = $2',
      [session.conversationId, requestId],
    );
    if (previous && (previous.input !== input || previous.kind !== kind))
      throw new ConflictException(
        'Request ID was already used for different input.',
      );
    return previous;
  }

  async begin(
    session: ConversationSession,
    requestId: string,
    input: string,
    kind: ConversationTurn['kind'],
  ) {
    const turns = await this.turns(session.conversationId, session.runner);
    session.signal.throwIfAborted();
    const previous = await this.previous(session, requestId, input, kind);
    if (previous) return { turn: previous, duplicate: true, history: turns };
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
    status: TerminalTurnStatus,
    messages: ModelMessage[],
    ui: UIMessage,
  ) {
    const rows: { id: string }[] = await session.runner.query(
      `
      WITH finished AS (
        UPDATE conversation_turns
        SET status = $3, model_messages = $4::jsonb, ui_message = $5::jsonb, finished_at = now()
        WHERE id = $1 AND conversation_id = $2 AND status = 'running'
        RETURNING id
      ), unfinished AS (
        UPDATE conversation_tool_executions
        SET status = 'unknown', finished_at = now()
        WHERE turn_id IN (SELECT id FROM finished) AND status = 'running'
      )
      SELECT id FROM finished`,
      [
        turnId,
        session.conversationId,
        status,
        JSON.stringify(messages),
        JSON.stringify(ui),
      ],
    );
    if (rows.length !== 1)
      throw new ConflictException('Turn is missing or already finalized.');
  }

  async finishApproval(
    session: ConversationSession,
    turnId: string,
    confirmationId: string,
    status: 'completed' | 'failed',
    messages: ModelMessage[],
    ui: UIMessage,
  ) {
    try {
      await session.runner.startTransaction();
      const result = await session.runner.query(
        `
        UPDATE conversation_approvals SET status = $4
        WHERE confirmation_id = $1 AND conversation_id = $2 AND turn_id = $3 AND status = 'executing'
        RETURNING confirmation_id`,
        [
          confirmationId,
          session.conversationId,
          turnId,
          status === 'completed' ? 'completed' : 'unknown',
        ],
        true,
      );
      if (result.affected !== 1)
        throw new ConflictException('Approval is not executing this turn.');
      await this.finish(session, turnId, status, messages, ui);
      await session.runner.commitTransaction();
    } catch (error) {
      // Roll back before callers attempt failure finalization; if rollback fails,
      // release() discards the session and recovery resolves the unfinished work.
      if (session.runner.isTransactionActive) {
        try {
          await session.runner.rollbackTransaction();
        } catch (rollbackError) {
          this.logger.error('Approval rollback failed.', rollbackError);
        }
      }
      throw error;
    }
  }

  async executeTool<T>(
    session: ConversationSession,
    turnId: string,
    callId: string,
    name: string,
    input: unknown,
    operation: () => Promise<T>,
  ): Promise<T> {
    session.signal.throwIfAborted();
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
      session.signal.throwIfAborted();
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
