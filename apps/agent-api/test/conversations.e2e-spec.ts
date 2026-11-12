import { AiModule } from '@nestjs/ai';
import { FakeModel } from '@nestjs/ai/testing';
import {
  StandardSchemaValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  createMigratedDataSource,
  databaseOptions,
} from '@cat-supplies-store/database';
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
      ...databaseOptions({
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
    expect(await first.text()).toContain('tool-output-available');
    let saved = await history(id);
    expect(saved.turns[0].status).toBe('completed');
    expect(saved.messages[1].parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-find-order',
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
    await first.body!.cancel();
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
    expect(saved.messages[1].parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-find-order',
        state: 'output-available',
      }),
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
      expect.objectContaining({
        type: 'tool-find-order',
        state: 'output-available',
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
      (part: { type: string }) => part.type === 'tool-change-address',
    ).output;
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
    expect(await (await http(path, { requestId })).json()).toMatchObject({
      status: 'completed',
      replayed: true,
    });
    expect((await http(path, { requestId: randomUUID() })).status).toBe(403);
    expect(business.changeAddress).toHaveBeenCalledTimes(1);
    expect(business.changeAddress).toHaveBeenCalledWith(
      'ord_125',
      '123 New Street',
      proposal.confirmationId,
      expect.objectContaining({ customerId: 'cus_123' }),
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
    expect((await http(path, { requestId: randomUUID() })).status).toBe(403);
    expect(business.changeAddress).toHaveBeenCalledTimes(1);
    expect((await history(id)).approvals[0].status).toBe('unknown');
  });
});
