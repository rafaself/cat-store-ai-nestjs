import { AiModule } from '@nestjs/ai';
import { FakeModel } from '@nestjs/ai/testing';
import {
  StandardSchemaValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createMigratedDataSource } from '@cat-supplies-store/database';
import { DataSource } from 'typeorm';
import * as pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AssistantModule } from '../src/apps/assistant/assistant.module';
import { BusinessApiClient } from '../src/integrations/business-api/business-api.client';
import { buildAgentDatabaseOptions } from '../src/database/database.module';
import { ConversationRepository } from '../src/apps/assistant/conversation.repository';

// Real PostgreSQL locks/migrations with an offline provider and deterministic business boundary.
describe('server-owned conversations (PostgreSQL, offline model)', () => {
  let database: DataSource;
  const apps: NestExpressApplication[] = [];
  const urls: string[] = [];
  const models: FakeModel[] = [];
  const created: string[] = [];
  const business = {
    authenticate: vi.fn(async (request) => {
      if (request.headers.authorization === 'Bearer customer')
        return { id: 'cus_123' };
      if (request.headers.authorization === 'Bearer other')
        return { id: 'cus_456' };
      throw new UnauthorizedException();
    }),
    findOrder: vi.fn(async () => ({
      id: 'ord_123',
      status: 'delivered',
      deliveryAddress: 'Original address',
      totalCents: 100,
      refundable: true,
    })),
    proposeAddressChange: vi.fn(async (orderId, address) => ({
      status: 'confirmation-required',
      confirmationId: randomUUID(),
      orderId,
      address,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    })),
    approveAddressChange: vi.fn(async () => ({ approved: true })),
    changeAddress: vi.fn(async (orderId, address) => ({
      id: orderId,
      deliveryAddress: address,
    })),
  };
  beforeAll(async () => {
    database = await createMigratedDataSource({
      ...buildAgentDatabaseOptions({
        connectionString: process.env.DATABASE_URL!,
        max: 10,
        connectionTimeoutMillis: 3_000,
      }),
      driver: pg,
    });
    for (let i = 0; i < 2; i++) {
      const model = new FakeModel();
      models.push(model);
      const module = await Test.createTestingModule({
        imports: [
          AiModule.forRoot({
            isGlobal: true,
            models: { default: model },
            defaults: { retry: false, timeout: false },
          }),
          AssistantModule,
        ],
        providers: [{ provide: DataSource, useValue: database }],
      })
        .overrideProvider(ConversationRepository)
        .useValue(new ConversationRepository(database))
        .overrideProvider(BusinessApiClient)
        .useValue(business)
        .overrideGuard(ThrottlerGuard)
        .useValue({ canActivate: () => true })
        .compile();
      // Export the database to the feature without adding a production-only testing hook.
      const repository = module.get(ConversationRepository);
      expect(repository).toBeDefined();
      const app = module.createNestApplication<NestExpressApplication>({
        logger: false,
      });
      app.useGlobalPipes(new StandardSchemaValidationPipe());
      await app.listen(0, '127.0.0.1');
      apps.push(app);
      urls.push(`${await app.getUrl()}/assistant/conversations`);
    }
  }, 20_000);
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => {
    for (const app of apps) await app.close();
    if (database?.isInitialized) {
      await database.query(
        'DELETE FROM conversation_approvals WHERE conversation_id = ANY($1::uuid[])',
        [created],
      );
      await database.query(
        'DELETE FROM conversation_tool_executions WHERE turn_id IN (SELECT id FROM conversation_turns WHERE conversation_id = ANY($1::uuid[]))',
        [created],
      );
      await database.query(
        'DELETE FROM conversation_turns WHERE conversation_id = ANY($1::uuid[])',
        [created],
      );
      await database.query(
        'DELETE FROM conversations WHERE id = ANY($1::uuid[])',
        [created],
      );
      await database.destroy();
    }
  });
  async function http(
    path = '',
    body?: unknown,
    token = 'customer',
    instance = 0,
  ) {
    return fetch(`${urls[instance]}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function create() {
    const response = await http('', {});
    expect(response.status).toBe(201);
    const { id } = await response.json();
    created.push(id);
    return id as string;
  }
  async function send(
    id: string,
    text = 'Hello',
    requestId = randomUUID(),
    instance = 0,
  ) {
    return http(`/${id}/messages`, { requestId, text }, 'customer', instance);
  }
  async function history(id: string) {
    const response = await http(`/${id}`);
    expect(response.status).toBe(200);
    return response.json();
  }

  it('enforces authentication, strict validation and conversation ownership', async () => {
    expect((await http('', {}, 'bad')).status).toBe(401);
    const id = await create();
    expect((await http(`/${id}`, undefined, 'other')).status).toBe(404);
    expect(
      (
        await http(
          `/${id}/messages`,
          { requestId: randomUUID(), text: 'Hi' },
          'other',
        )
      ).status,
    ).toBe(404);
    for (const extra of [
      { messages: [] },
      { role: 'assistant' },
      { customerId: 'cus_456' },
      { toolCalls: [{ name: 'change-address' }] },
    ]) {
      expect(
        (
          await http(`/${id}/messages`, {
            requestId: randomUUID(),
            text: 'Hi',
            ...extra,
          })
        ).status,
      ).toBe(400);
    }
    expect((await http('/not-a-uuid')).status).toBe(400);
    expect((await history(id)).turns).toEqual([]);
  });
  it('persists ordered turns and builds subsequent model context only from storage', async () => {
    const id = await create();
    models[0]!.reply(
      { toolCalls: [{ name: 'find-order', input: { orderId: 'ord_123' } }] },
      'Your order arrived.',
    );
    const first = await send(id, 'Find my order');
    expect(first.status).toBe(200);
    const streamed = await first.text();
    expect(streamed).toContain('finding-order');
    expect(streamed).not.toMatch(
      /tool-output|toolCallId|deliveryAddress|Original address/,
    );
    let saved = await history(id);
    expect(saved.turns[0].status).toBe('completed');
    expect(saved.messages[1].parts).toEqual([
      { type: 'text', text: 'Your order arrived.' },
    ]);
    expect(await apps[0]!.get(ConversationRepository).tools(id)).toContainEqual(
      expect.objectContaining({
        name: 'find-order',
        status: 'completed',
        output: expect.objectContaining({ id: 'ord_123' }),
      }),
    );
    models[1]!.reply('It arrived at your original address.');
    const second = await send(id, 'Where?', randomUUID(), 1);
    await second.text();
    expect(models[1]!.lastCall?.options.prompt).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'tool' })]),
    );
    saved = await history(id);
    expect(
      saved.turns.map((turn: { sequence: number }) => turn.sequence),
    ).toEqual([1, 2]);
    expect(business.findOrder).toHaveBeenCalledTimes(1);
  });
  it('replays accepted request IDs and rejects their reuse with different input', async () => {
    const id = await create();
    const requestId = randomUUID();
    models[0]!.reply('Hello');
    await (await send(id, 'Hi', requestId)).text();
    const duplicate = await send(id, 'Hi', requestId, 1);
    expect(await duplicate.json()).toMatchObject({
      status: 'completed',
      replayed: true,
    });
    expect((await send(id, 'Different', requestId)).status).toBe(409);
    expect((await history(id)).turns).toHaveLength(1);
  });
  it('serializes turns across instances and survives client disconnection during a tool operation', async () => {
    const id = await create();
    let resolve!: (
      order: Awaited<ReturnType<typeof business.findOrder>>,
    ) => void;
    business.findOrder.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    models[0]!.reply(
      { toolCalls: [{ name: 'find-order', input: { orderId: 'ord_123' } }] },
      'Saved after disconnect',
    );
    const requestId = randomUUID();
    const first = await send(id, 'Find', requestId);
    await vi.waitFor(() => expect(business.findOrder).toHaveBeenCalledTimes(1));
    const reader = first.body!.getReader();
    let progress = '';
    const decoder = new TextDecoder();
    while (!progress.includes('finding-order')) {
      const chunk = await reader.read();
      expect(chunk.done).toBe(false);
      progress += decoder.decode(chunk.value, { stream: true });
    }
    expect(progress).not.toMatch(/toolCallId|toolName|orderId|ord_123/);
    await reader.cancel();
    expect((await send(id, 'Overlapping', randomUUID(), 1)).status).toBe(409);
    expect((await send(id, 'Find', requestId, 1)).status).toBe(409);
    expect((await history(id)).active).toBe(true);
    resolve({
      id: 'ord_123',
      status: 'delivered',
      deliveryAddress: 'Original address',
      totalCents: 100,
      refundable: true,
    });
    await vi.waitFor(async () =>
      expect((await history(id)).active).toBe(false),
    );
    const saved = await history(id);
    expect(saved.turns).toHaveLength(1);
    expect(saved.turns[0].status).toBe('completed');
    expect(saved.messages[1].parts).toEqual([
      { type: 'text', text: 'Saved after disconnect' },
    ]);
    expect(await apps[0]!.get(ConversationRepository).tools(id)).toContainEqual(
      expect.objectContaining({ name: 'find-order', status: 'completed' }),
    );
  });
  it('recovers abandoned executions without replaying uncertain tools', async () => {
    const id = await create();
    const repo = apps[0]!.get(ConversationRepository);
    const session = await repo.acquire(id, 'cus_123');
    const requestId = randomUUID();
    const { turn } = await repo.begin(session, requestId, 'Find', 'message');
    await session.runner.query(
      `INSERT INTO conversation_tool_executions(turn_id, tool_call_id, name, input, status) VALUES ($1, 'uncertain', 'find-order', '{}', 'running')`,
      [turn.id],
    );
    await repo.executeTool(
      session,
      turn.id,
      'saved',
      'find-order',
      { orderId: 'ord_123' },
      async () => ({ id: 'ord_123', status: 'delivered' }),
    );
    await session.release(); // Simulate a process losing its connection before finalization.
    const saved = await history(id);
    expect(saved.turns[0].status).toBe('interrupted');
    expect(await repo.tools(id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool_call_id: 'uncertain',
          status: 'unknown',
        }),
        expect.objectContaining({
          tool_call_id: 'saved',
          status: 'completed',
          output: { id: 'ord_123', status: 'delivered' },
        }),
      ]),
    );
    expect(await (await send(id, 'Find', requestId)).json()).toMatchObject({
      status: 'interrupted',
      replayed: true,
    });
    expect(business.findOrder).not.toHaveBeenCalled();
    models[0]!.reply('I will recheck uncertain operations.');
    await (await send(id, 'What happened?')).text();
    expect(models[0]!.lastCall?.options.prompt).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          content: expect.arrayContaining([
            expect.objectContaining({ toolCallId: 'saved' }),
          ]),
        }),
      ]),
    );
  });
  it('persists tool results even when the next model step fails', async () => {
    const id = await create();
    models[0]!.reply(
      { toolCalls: [{ name: 'find-order', input: { orderId: 'ord_123' } }] },
      new Error('private provider failure'),
    );
    const response = await send(id, 'Find');
    const text = await response.text();
    expect(text).not.toContain('private provider');
    const saved = await history(id);
    expect(saved.turns[0].status).toBe('failed');
    expect(saved.messages[1].parts).toContainEqual(
      expect.objectContaining({ type: 'text' }),
    );
    expect(JSON.stringify(saved)).not.toMatch(
      /tool-find-order|deliveryAddress|Original address|private provider/,
    );
    expect(await apps[0]!.get(ConversationRepository).tools(id)).toContainEqual(
      expect.objectContaining({
        name: 'find-order',
        status: 'completed',
        output: expect.objectContaining({ id: 'ord_123' }),
      }),
    );
  });
  it('applies only stored proposals with a dedicated, idempotent approval endpoint', async () => {
    const id = await create();
    models[0]!.reply(
      {
        toolCalls: [
          {
            name: 'change-address',
            input: { orderId: 'ord_125', address: '123 New Street' },
          },
        ],
      },
      'Please confirm.',
    );
    await (await send(id, 'Change address')).text();
    const saved = await history(id);
    const proposal = saved.messages[1].parts.find(
      (part: { type: string }) => part.type === 'data-address-approval',
    ).data;
    expect(business.changeAddress).not.toHaveBeenCalled();
    const otherConversation = await create();
    expect(
      (
        await http(
          `/${otherConversation}/approvals/${proposal.confirmationId}`,
          { requestId: randomUUID() },
        )
      ).status,
    ).toBe(404);
    const path = `/${id}/approvals/${proposal.confirmationId}`;
    const requestId = randomUUID();
    expect((await http(path, { requestId }, 'other')).status).toBe(404);
    expect((await http(path, { requestId, address: 'forged' })).status).toBe(
      400,
    );
    const approved = await http(path, { requestId });
    expect(approved.status).toBe(201);
    const approvedHistory = await history(id);
    expect(approvedHistory.messages).toContainEqual(
      expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: 'Confirm address change.' }],
      }),
    );
    expect(JSON.stringify(approvedHistory)).not.toMatch(
      /Apply approved address change|approve-address|apply-address|toolCallId/,
    );
    expect(await (await http(path, { requestId })).json()).toMatchObject({
      status: 'completed',
      replayed: true,
    });
    const beforeRejected = (await history(id)).turns.length;
    for (let index = 0; index < 3; index++)
      expect((await http(path, { requestId: randomUUID() })).status).toBe(403);
    expect((await history(id)).turns).toHaveLength(beforeRejected);
    expect(business.changeAddress).toHaveBeenCalledTimes(1);
    expect(business.changeAddress).toHaveBeenCalledWith(
      'ord_125',
      '123 New Street',
      proposal.confirmationId,
      expect.objectContaining({ customerId: 'cus_123' }),
      expect.any(AbortSignal),
    );
  });
  it('rejects expired approvals and model attempts to apply a change', async () => {
    const id = await create();
    models[0]!.reply(
      {
        toolCalls: [
          {
            name: 'change-address',
            input: {
              orderId: 'ord_125',
              address: '456 New Street',
              confirmationId: randomUUID(),
            },
          },
        ],
      },
      'Unable to apply.',
    );
    await (await send(id, 'Apply a fabricated confirmation')).text();
    expect(business.changeAddress).not.toHaveBeenCalled();
    expect(business.proposeAddressChange).not.toHaveBeenCalled();
    models[0]!.reply(
      {
        toolCalls: [
          {
            name: 'change-address',
            input: { orderId: 'ord_125', address: '456 New Street' },
          },
        ],
      },
      'Please confirm.',
    );
    await (await send(id, 'Propose instead')).text();
    const approvals = (await history(id)).approvals;
    const confirmationId = approvals[0].confirmationId;
    await database.query(
      `UPDATE conversation_approvals SET proposal = jsonb_set(proposal, '{expiresAt}', to_jsonb('2000-01-01T00:00:00.000Z'::text)) WHERE confirmation_id = $1`,
      [confirmationId],
    );
    expect(
      (
        await http(`/${id}/approvals/${confirmationId}`, {
          requestId: randomUUID(),
        })
      ).status,
    ).toBe(403);
    expect(business.approveAddressChange).not.toHaveBeenCalled();
    expect(business.changeAddress).not.toHaveBeenCalled();
  });
  it('does not repeat an address operation with an uncertain result', async () => {
    const id = await create();
    models[0]!.reply(
      {
        toolCalls: [
          {
            name: 'change-address',
            input: { orderId: 'ord_125', address: '789 New Street' },
          },
        ],
      },
      'Please confirm.',
    );
    await (await send(id, 'Propose')).text();
    const confirmationId = (await history(id)).approvals[0].confirmationId;
    business.changeAddress.mockRejectedValueOnce(
      new Error('Connection lost after the remote operation'),
    );
    const requestId = randomUUID();
    const path = `/${id}/approvals/${confirmationId}`;
    expect((await http(path, { requestId })).status).toBe(500);
    expect(await (await http(path, { requestId })).json()).toMatchObject({
      replayed: true,
      status: 'failed',
    });
    const beforeRejected = (await history(id)).turns.length;
    for (let index = 0; index < 3; index++)
      expect((await http(path, { requestId: randomUUID() })).status).toBe(403);
    expect((await history(id)).turns).toHaveLength(beforeRejected);
    expect(business.changeAddress).toHaveBeenCalledTimes(1);
    expect((await history(id)).approvals[0].status).toBe('unknown');
  });
  it('bounds statements and lock waits, then releases a reusable session', async () => {
    const id = await create();
    const repo = apps[0]!.get(ConversationRepository);
    const session = await repo.acquire(id, 'cus_123');
    expect(
      (await session.runner.query('SHOW statement_timeout'))[0]
        .statement_timeout,
    ).toBe('10s');
    expect(
      (await session.runner.query('SHOW lock_timeout'))[0].lock_timeout,
    ).toBe('2s');
    await session.runner.query("SET statement_timeout = '40ms'");
    await expect(
      session.runner.query('SELECT pg_sleep(1)'),
    ).rejects.toMatchObject({ driverError: { code: '57014' } });
    await session.runner.query("SET statement_timeout = '10s'");
    const blocker = database.createQueryRunner();
    await blocker.connect();
    try {
      await blocker.startTransaction();
      await blocker.query(
        'SELECT * FROM conversations WHERE id = $1 FOR UPDATE',
        [id],
      );
      await session.runner.query("SET lock_timeout = '40ms'");
      await expect(
        session.runner.query(
          'UPDATE conversations SET created_at = now() WHERE id = $1',
          [id],
        ),
      ).rejects.toMatchObject({ driverError: { code: '55P03' } });
      await session.runner.query("SET lock_timeout = '2s'");
    } finally {
      await blocker.rollbackTransaction();
      await blocker.release();
      await session.release();
    }
    const next = await repo.acquire(id, 'cus_123');
    await next.release();
  });

  it('evicts a real pooled connection when unlocking fails, without leaking its lock', async () => {
    const id = await create();
    const repo = apps[0]!.get(ConversationRepository);
    const session = await repo.acquire(id, 'cus_123');
    const [{ pid }] = await session.runner.query(
      'SELECT pg_backend_pid() AS pid',
    );
    const originalQuery = session.runner.query.bind(session.runner);
    vi.spyOn(session.runner, 'query').mockImplementation(
      async (sql, ...args) => {
        if (String(sql).includes('pg_advisory_unlock'))
          throw new Error('Injected unlock failure');
        return originalQuery(sql, ...args);
      },
    );
    await expect(session.release()).rejects.toThrow('Injected unlock failure');
    expect(
      await database.query('SELECT pid FROM pg_stat_activity WHERE pid = $1', [
        pid,
      ]),
    ).toEqual([]);
    const next = await repo.acquire(id, 'cus_123');
    await next.release();
  });

  it('rolls back approval and turn finalization together and checks finish invariants', async () => {
    const id = await create();
    const repo = apps[0]!.get(ConversationRepository);
    const session = await repo.acquire(id, 'cus_123');
    const { turn } = await repo.begin(
      session,
      randomUUID(),
      'Approve',
      'approval',
    );
    const confirmationId = randomUUID();
    await session.runner.query(
      `INSERT INTO conversation_approvals(confirmation_id, conversation_id, proposal, status, turn_id) VALUES ($1, $2, '{}', 'executing', $3)`,
      [confirmationId, id, turn.id],
    );
    await session.runner.query(
      `INSERT INTO conversation_tool_executions(turn_id, tool_call_id, name, input, status) VALUES ($1, 'call', 'apply-address', '{}', 'running')`,
      [turn.id],
    );
    const ui = { id: turn.id, role: 'assistant' as const, parts: [] };
    const finish = repo.finish.bind(repo);
    const failure = vi
      .spyOn(repo, 'finish')
      .mockImplementationOnce(async (...args) => {
        await finish(...args);
        throw new Error('Injected finalization failure');
      });
    try {
      await expect(
        repo.finishApproval(
          session,
          turn.id,
          confirmationId,
          'completed',
          [],
          ui,
        ),
      ).rejects.toThrow('Injected finalization failure');
      expect((await repo.turns(id))[0]?.status).toBe('running');
      expect((await repo.approvals(id))[0]?.status).toBe('executing');
      expect((await repo.tools(id))[0]?.status).toBe('running');
      failure.mockRestore();
      await repo.finishApproval(
        session,
        turn.id,
        confirmationId,
        'completed',
        [],
        ui,
      );
      expect((await repo.turns(id))[0]?.status).toBe('completed');
      expect((await repo.approvals(id))[0]?.status).toBe('completed');
      expect((await repo.tools(id))[0]?.status).toBe('unknown');
      await expect(
        repo.finish(session, turn.id, 'failed', [], ui),
      ).rejects.toThrow('already finalized');
      await expect(
        repo.finish(session, randomUUID(), 'completed', [], ui),
      ).rejects.toThrow('missing');
    } finally {
      failure.mockRestore();
      await session.release();
    }
  });

  it('reads one snapshot while another connection commits a turn and tool result', async () => {
    const id = await create();
    const repo = apps[0]!.get(ConversationRepository);
    const query = database.query.bind(database);
    const delayed = vi
      .spyOn(database, 'query')
      .mockImplementation((sql, parameters, runner) => {
        if (sql.includes('jsonb_agg(t ORDER BY t.sequence)')) {
          sql =
            '/* conversation-snapshot-test */ WITH delay AS MATERIALIZED (SELECT pg_sleep(0.3)) ' +
            sql.replace(
              'FROM conversations c WHERE',
              'FROM conversations c CROSS JOIN delay WHERE',
            );
        }
        return query(sql, parameters, runner);
      });
    try {
      const reading = repo.snapshot(id, 'cus_123');
      await vi.waitFor(async () =>
        expect(
          (
            await query(
              `SELECT pid FROM pg_stat_activity WHERE query LIKE '/* conversation-snapshot-test */%' AND wait_event = 'PgSleep'`,
            )
          ).length,
        ).toBe(1),
      );
      const session = await repo.acquire(id, 'cus_123');
      try {
        const { turn } = await repo.begin(
          session,
          randomUUID(),
          'New turn',
          'message',
        );
        await repo.executeTool(
          session,
          turn.id,
          'new-tool',
          'find-order',
          {},
          async () => ({ id: 'ord_123' }),
        );
      } finally {
        await session.release();
      }
      const snapshot = await reading;
      expect(snapshot).toMatchObject({ turns: [], tools: [], approvals: [] });
    } finally {
      delayed.mockRestore();
    }
    const current = await repo.snapshot(id, 'cus_123');
    expect(current.turns).toHaveLength(1);
    expect(current.tools).toHaveLength(1);
    await expect(repo.snapshot(id, 'cus_456')).rejects.toThrow('not found');
  });

  it('detects real connection loss during a remote operation and never replays it', async () => {
    const id = await create();
    const repo = apps[0]!.get(ConversationRepository);
    const session = await repo.acquire(id, 'cus_123');
    const requestId = randomUUID();
    const { turn } = await repo.begin(
      session,
      requestId,
      'Approve',
      'approval',
    );
    const confirmationId = randomUUID();
    await session.runner.query(
      `INSERT INTO conversation_approvals(confirmation_id, conversation_id, proposal, status, turn_id) VALUES ($1, $2, '{}', 'executing', $3)`,
      [confirmationId, id, turn.id],
    );
    let complete!: () => void;
    const remote = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const pending = repo.executeTool(
      session,
      turn.id,
      'in-flight',
      'apply-address',
      {},
      remote,
    );
    const settled = pending.catch((error: unknown) => error);
    await vi.waitFor(() => expect(remote).toHaveBeenCalledTimes(1));
    const [{ pid }] = await session.runner.query(
      'SELECT pg_backend_pid() AS pid',
    );
    await database.query('SELECT pg_terminate_backend($1)', [pid]);
    await vi.waitFor(() => expect(session.signal.aborted).toBe(true));
    const next = await repo.acquire(id, 'cus_123');
    try {
      expect((await repo.turns(id))[0]?.status).toBe('interrupted');
      expect((await repo.approvals(id))[0]?.status).toBe('unknown');
      expect((await repo.tools(id))[0]?.status).toBe('unknown');
      const duplicate = await repo.begin(
        next,
        requestId,
        'Approve',
        'approval',
      );
      expect(duplicate.duplicate).toBe(true);
      complete();
      expect(await settled).toBeInstanceOf(Error);
      const forbiddenOperation = vi.fn(async () => ({}));
      await expect(
        repo.executeTool(
          session,
          turn.id,
          'late',
          'apply-address',
          {},
          forbiddenOperation,
        ),
      ).rejects.toThrow();
      expect(forbiddenOperation).not.toHaveBeenCalled();
      expect(remote).toHaveBeenCalledTimes(1);
    } finally {
      await next.release();
      await session.release();
    }
  });
  it('keeps mapped inserts, lookups, joins and updates on the session transaction', async () => {
    const id = await create();
    const repo = apps[0]!.get(ConversationRepository);
    const session = await repo.acquire(id, 'cus_123');
    const requestId = randomUUID();
    const statements: string[] = [];
    const query = session.runner.query.bind(session.runner);
    vi.spyOn(session.runner, 'query').mockImplementation((sql, ...args) => {
      statements.push(String(sql));
      return query(sql, ...args);
    });
    try {
      await session.runner.startTransaction();
      statements.length = 0;
      const { turn } = await repo.begin(
        session,
        requestId,
        'Test rollback',
        'message',
      );
      // Preserve the three-round-trip budget: ordered history, idempotency lookup,
      // and INSERT RETURNING, with no extra lookup to recover server defaults.
      expect(statements).toHaveLength(3);
      expect(turn).toMatchObject({
        status: 'running',
        sequence: 1,
        model_messages: [],
        ui_message: null,
      });
      expect(
        await repo.previous(session, requestId, 'Test rollback', 'message'),
      ).toMatchObject({ id: turn.id });
      const input = {
        orderId: 'ord_123',
        nested: { quote: "' ; SELECT 1 --", enabled: true },
      };
      const output = [
        { product: 'toy', price: 123 },
        { product: 'food', price: null },
      ];
      const operation = vi.fn(async () => output);
      expect(
        await repo.executeTool(
          session,
          turn.id,
          'json',
          'search-products',
          input,
          operation,
        ),
      ).toEqual(output);
      expect(
        await repo.executeTool(
          session,
          turn.id,
          'json',
          'search-products',
          { nested: input.nested, orderId: input.orderId },
          operation,
        ),
      ).toEqual(output);
      expect(operation).toHaveBeenCalledTimes(1);
      await expect(
        repo.executeTool(
          session,
          turn.id,
          'json',
          'search-products',
          { orderId: 'different' },
          operation,
        ),
      ).rejects.toThrow('cannot be repeated');
      expect(await repo.tools(id, session.runner)).toEqual([
        expect.objectContaining({ input, output, status: 'completed' }),
      ]);
      expect(await repo.turns(id)).toEqual([]);
      expect(await repo.tools(id)).toEqual([]);
      await session.runner.rollbackTransaction();
      expect(await repo.turns(id)).toEqual([]);
      expect(await repo.tools(id)).toEqual([]);
    } finally {
      await session.release();
    }
  });

  it('maps customer-scoped conversation lists and guards approval transitions', async () => {
    const id = await create();
    const repo = apps[0]!.get(ConversationRepository);
    const other = await (await http('', {}, 'other')).json();
    created.push(other.id);
    const listing = await (await http()).json();
    expect(listing).toContainEqual(
      expect.objectContaining({ id, created_at: expect.any(String) }),
    );
    expect(listing.some((entry: { id: string }) => entry.id === other.id)).toBe(
      false,
    );
    const session = await repo.acquire(id, 'cus_123');
    const confirmationId = randomUUID();
    const { turn } = await repo.begin(
      session,
      randomUUID(),
      'Approve',
      'approval',
    );
    try {
      await session.runner.query(
        `INSERT INTO conversation_approvals(confirmation_id, conversation_id, proposal) VALUES ($1, $2, '{}')`,
        [confirmationId, id],
      );
      expect(await repo.approval(session, confirmationId)).toMatchObject({
        status: 'pending',
        turn_id: null,
      });
      await repo.startApproval(session, confirmationId, turn.id);
      expect(await repo.approval(session, confirmationId)).toMatchObject({
        status: 'executing',
        turn_id: turn.id,
      });
      await expect(
        repo.startApproval(session, confirmationId, turn.id),
      ).rejects.toThrow('not pending');
      await expect(repo.approval(session, randomUUID())).rejects.toThrow(
        'not found',
      );
      await repo.finishApproval(
        session,
        turn.id,
        confirmationId,
        'failed',
        [],
        { id: turn.id, role: 'assistant', parts: [] },
      );
    } finally {
      await session.release();
    }
  });
});
