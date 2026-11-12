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
import {
  ConversationEntity,
  ConversationTurnEntity,
  ConversationToolExecutionEntity,
  ConversationApprovalEntity,
} from '@cat-supplies-store/database';
import { addressChangeProposalSchema } from '@cat-supplies-store/contracts';

export type TurnStatus = ConversationTurnEntity['status'];
export type TerminalTurnStatus = Exclude<TurnStatus, 'running'>;
export interface ConversationTurn {
  id: string;
  conversation_id: string;
  request_id: string;
  sequence: number;
  kind: ConversationTurnEntity['kind'];
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
  status: ConversationToolExecutionEntity['status'];
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
    await this.database
      .getRepository(ConversationEntity)
      .insert({ id, customer_id: customerId });
    return { id };
  }

  list(customerId: string): Promise<{ id: string; created_at: Date }[]> {
    return this.database.getRepository(ConversationEntity).find({
      select: { id: true, created_at: true },
      where: { customer_id: customerId },
      order: { created_at: 'DESC' },
      take: 50,
    });
  }

  async assertOwner(conversationId: string, customerId: string) {
    const owned = await this.database
      .getRepository(ConversationEntity)
      .existsBy({
        id: conversationId,
        customer_id: customerId,
      });
    if (!owned) throw new NotFoundException('Conversation not found.');
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
    const activeTurns = runner.manager
      .createQueryBuilder()
      .subQuery()
      .select('turn.id')
      .from(ConversationTurnEntity, 'turn')
      .where('turn.conversation_id = :conversationId', { conversationId })
      .andWhere('turn.status = :turnStatus', { turnStatus: 'running' });
    await runner.manager
      .createQueryBuilder()
      .update(ConversationToolExecutionEntity)
      .set({ status: 'unknown', finished_at: () => 'CURRENT_TIMESTAMP' })
      .where({ status: 'running' })
      .andWhere(`turn_id IN ${activeTurns.getQuery()}`)
      .setParameters(activeTurns.getParameters())
      .execute();
    await runner.manager
      .createQueryBuilder()
      .update(ConversationApprovalEntity)
      .set({ status: 'unknown' })
      .where({ conversation_id: conversationId, status: 'executing' })
      .execute();
    await runner.manager
      .createQueryBuilder()
      .update(ConversationTurnEntity)
      .set({ status: 'interrupted', finished_at: () => 'CURRENT_TIMESTAMP' })
      .where({ conversation_id: conversationId, status: 'running' })
      .execute();
    await runner.commitTransaction();
    // On failure, acquire() invokes session cleanup to roll back or discard.
  }

  async turns(
    conversationId: string,
    runner?: QueryRunner,
  ): Promise<ConversationTurn[]> {
    const turns = await (runner?.manager ?? this.database.manager)
      .getRepository(ConversationTurnEntity)
      .find({
        where: { conversation_id: conversationId },
        order: { sequence: 'ASC' },
      });
    // SDK message types stay in the Agent API; shared entities map JSONB as unknown.
    return turns as ConversationTurn[];
  }

  tools(
    conversationId: string,
    runner?: QueryRunner,
  ): Promise<ToolExecution[]> {
    return (runner?.manager ?? this.database.manager)
      .getRepository(ConversationToolExecutionEntity)
      .createQueryBuilder('execution')
      .innerJoin(ConversationTurnEntity, 'turn', 'turn.id = execution.turn_id')
      .where('turn.conversation_id = :conversationId', { conversationId })
      .orderBy('turn.sequence', 'ASC')
      .addOrderBy('execution.created_at', 'ASC')
      .addOrderBy('execution.tool_call_id', 'ASC')
      .getMany();
  }

  async approvals(
    conversationId: string,
  ): Promise<{ confirmationId: string; status: string }[]> {
    const approvals = await this.database
      .getRepository(ConversationApprovalEntity)
      .find({
        select: { confirmation_id: true, status: true },
        where: { conversation_id: conversationId },
      });
    return approvals.map((approval) => ({
      confirmationId: approval.confirmation_id,
      status: approval.status,
    }));
  }

  async approval(session: ConversationSession, confirmationId: string) {
    const approval = await session.runner.manager
      .getRepository(ConversationApprovalEntity)
      .findOneBy({
        confirmation_id: confirmationId,
        conversation_id: session.conversationId,
      });
    if (!approval) throw new NotFoundException('Proposal not found.');
    return approval;
  }

  async startApproval(
    session: ConversationSession,
    confirmationId: string,
    turnId: string,
  ) {
    const result = await session.runner.manager
      .createQueryBuilder()
      .update(ConversationApprovalEntity)
      .set({ status: 'executing', turn_id: turnId })
      .where({
        confirmation_id: confirmationId,
        conversation_id: session.conversationId,
        status: 'pending',
      })
      .execute();
    if (result.affected !== 1)
      throw new ConflictException('Proposal is not pending.');
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
    const previous = await session.runner.manager
      .getRepository(ConversationTurnEntity)
      .findOneBy({
        conversation_id: session.conversationId,
        request_id: requestId,
      });
    if (previous && (previous.input !== input || previous.kind !== kind))
      throw new ConflictException(
        'Request ID was already used for different input.',
      );
    return previous as ConversationTurn | null;
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
    const result = await session.runner.manager
      .createQueryBuilder()
      .insert()
      .into(ConversationTurnEntity)
      .values({
        id: randomUUID(),
        conversation_id: session.conversationId,
        request_id: requestId,
        sequence: turns.length + 1,
        kind,
        input,
        status: 'running',
      })
      .returning('*')
      .execute();
    const [turn] = result.raw as ConversationTurn[];
    return { turn, duplicate: false, history: turns };
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
      const result = await session.runner.manager
        .createQueryBuilder()
        .update(ConversationApprovalEntity)
        .set({ status: status === 'completed' ? 'completed' : 'unknown' })
        .where({
          confirmation_id: confirmationId,
          conversation_id: session.conversationId,
          turn_id: turnId,
          status: 'executing',
        })
        .execute();
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
    await session.runner.manager
      .createQueryBuilder()
      .insert()
      .into(ConversationToolExecutionEntity)
      .values({
        turn_id: turnId,
        tool_call_id: callId,
        name,
        input: () => 'CAST(:input AS jsonb)',
        status: 'running',
      })
      .setParameter('input', JSON.stringify(input))
      .execute();
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
      await this.finishTool(session, turnId, callId, status);
      throw error;
    }
    // Never report success to the model before the operation result is durable.
    const proposal = addressChangeProposalSchema.safeParse(output);
    if (name === 'change-address' && proposal.success) {
      const saved: { turn_id: string }[] = await session.runner.query(
        `WITH saved AS (
          UPDATE conversation_tool_executions
          SET status = 'completed', output = $3::jsonb, finished_at = now()
          WHERE turn_id = $1 AND tool_call_id = $2 AND status = 'running'
          RETURNING turn_id
        ), proposed AS (
          INSERT INTO conversation_approvals(confirmation_id, conversation_id, proposal)
          SELECT $4, $5, $3::jsonb FROM saved ON CONFLICT DO NOTHING
        )
        SELECT turn_id FROM saved`,
        [
          turnId,
          callId,
          JSON.stringify(output),
          proposal.data.confirmationId,
          session.conversationId,
        ],
      );
      if (saved.length !== 1)
        throw new ConflictException('Tool execution is not running.');
    } else {
      await this.finishTool(session, turnId, callId, 'completed', output);
    }
    return output;
  }
  private async finishTool(
    session: ConversationSession,
    turnId: string,
    callId: string,
    status: 'completed' | 'failed' | 'unknown',
    output?: unknown,
  ) {
    const result = await session.runner.manager
      .createQueryBuilder()
      .update(ConversationToolExecutionEntity)
      .set({
        status,
        finished_at: () => 'CURRENT_TIMESTAMP',
        ...(status === 'completed'
          ? { output: () => 'CAST(:output AS jsonb)' }
          : {}),
      })
      .where({ turn_id: turnId, tool_call_id: callId, status: 'running' })
      .setParameter('output', JSON.stringify(output))
      .execute();
    if (result.affected !== 1)
      throw new ConflictException('Tool execution is not running.');
  }
}
