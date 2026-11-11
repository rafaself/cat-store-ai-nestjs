import {
  FakeEmbeddingModel,
  FakeModel,
  callTool,
  overrideEmbeddingModels,
  overrideModels,
} from '@nestjs/ai/testing';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowClient } from '@nestjs/workflows';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AppModule as AgentModule } from '../../agent-api/src/app.module';
import { ConfigService } from '@nestjs/config';
import { AppModule as WorkerModule } from '../../agent-worker/src/app.module';
import { DataSource } from 'typeorm';
import { PaymentsService } from '@cat-supplies-store/refunds';
import { randomUUID } from 'node:crypto';

function fakeEmbedding(text: string): number[] {
  const vector = Array.from({ length: 1024 }, () => 0);
  const normalized = text.toLowerCase();
  const dimension =
    normalized.includes('salmon') || normalized.includes('digest')
      ? 0
      : normalized.includes('toy') || normalized.includes('feather')
        ? 1
        : normalized.includes('litter')
          ? 2
          : 3;
  vector[dimension] = 1;
  return vector;
}

describe('Cat store API (e2e)', () => {
  let app: INestApplication<App>;
  let fakeModel: FakeModel;
  let agent: INestApplication<App>;
  let worker: TestingModule | undefined;

  beforeAll(async () => {
    fakeModel = new FakeModel(['Hello from the offline fake model.']);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const builder = Test.createTestingModule({ imports: [AgentModule] });
    const fixture = await overrideModels(builder, {
      default: fakeModel,
    }).compile();
    fixture.get(ConfigService).set('businessApi.url', await app.getUrl());
    agent = fixture.createNestApplication();
    await agent.init();

    const database = app.get(DataSource);
    await database.query('DELETE FROM payment_refunds');
    await database.query(
      `UPDATE payments SET refunded_cents = 0, status = 'captured'
       WHERE id IN ('pay_123', 'pay_124')`,
    );
    await database.query(
      "UPDATE orders SET delivery_address = '123 Demo Street, São Paulo' WHERE id = 'ord_125'",
    );
    await database.query('UPDATE products SET embedding = NULL');
  }, 30_000);

  afterAll(async () => {
    await worker?.close();
    await agent?.close();
    await app?.close();
  });

  it('serves health and requires demo authentication on chat', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok' });
    await request(app.getHttpServer())
      .post('/assistant/chat')
      .send({ messages: [] })
      .expect(404);
    await request(app.getHttpServer())
      .get('/agent-tools/orders/ord_123')
      .expect(401);
    await request(app.getHttpServer())
      .get('/agent-tools/catalog/search?q=salmon')
      .expect(401);
    await request(app.getHttpServer())
      .get('/agent-tools/customer')
      .set('Authorization', 'Bearer test-support-token')
      .expect(401);

    await request(agent.getHttpServer())
      .post('/assistant/chat')
      .send({ messages: [] })
      .expect(401);
    await request(app.getHttpServer())
      .post('/refunds')
      .send({ orderId: 'ord_123', reason: 'Customer request.' })
      .expect(401);
    await request(app.getHttpServer()).post('/catalog/index').expect(401);
    await request(app.getHttpServer())
      .get('/refunds/unknown/approvals')
      .expect(401);
  });

  it('rejects invalid bodies and query parameters before handling requests', async () => {
    await request(agent.getHttpServer())
      .post('/assistant/chat')
      .set('Authorization', 'Bearer test-customer-token')
      .send({ messages: [] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/refunds')
      .set('Authorization', 'Bearer test-customer-token')
      .send({ orderId: 'ord_123', reason: '  ' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/refunds/unknown/approvals/key')
      .set('Authorization', 'Bearer test-support-token')
      .send({ approved: false, reason: '  ' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/catalog/search')
      .query({ q: '  ' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/catalog/search')
      .query({ q: 'food', limit: '11' })
      .expect(400);
  });

  it('streams a chat reply through the fake language model', async () => {
    const response = await request(agent.getHttpServer())
      .post('/assistant/chat')
      .set('Authorization', 'Bearer test-customer-token')
      .send({
        messages: [
          {
            id: 'message-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Hi there' }],
          },
        ],
      })
      .expect(200);
    expect(response.text).toContain('"delta":"Hello "');
    expect(response.text).toContain('"delta":"model."');
    expect(fakeModel.calls[0]?.stream).toBe(true);
    expect(fakeModel.calls[0]?.tools).toEqual([
      'find-order',
      'change-address',
      'search-products',
    ]);
  });

  it('executes a streamed model tool call through the Business API', async () => {
    fakeModel.reply(
      { toolCalls: [{ name: 'find-order', input: { orderId: 'ord_123' } }] },
      'Your order has been delivered.',
    );
    const response = await request(agent.getHttpServer())
      .post('/assistant/chat')
      .set('Authorization', 'Bearer test-customer-token')
      .send({
        messages: [
          {
            id: 'tool-message',
            role: 'user',
            parts: [{ type: 'text', text: 'Find my order ord_123' }],
          },
        ],
      })
      .expect(200);
    expect(response.text).toContain('tool-output-available');
    expect(response.text).toContain('ord_123');
    expect(response.text).toContain('delivered');
  });

  it('scopes order tools to the authenticated customer and allows eligible address changes', async () => {
    await expect(
      callTool(
        agent,
        'find-order',
        { orderId: 'ord_456' },
        {
          caller: {
            request: {
              headers: { authorization: 'Bearer test-customer-token' },
            },
          },
        },
      ),
    ).rejects.toThrow();

    await expect(
      callTool(
        agent,
        'change-address',
        {
          orderId: 'ord_125',
          address: '99 New Address, São Paulo',
        },
        {
          caller: {
            request: {
              headers: { authorization: 'Bearer test-customer-token' },
            },
          },
        },
      ),
    ).resolves.toMatchObject({ deliveryAddress: '99 New Address, São Paulo' });

    await expect(
      callTool(
        agent,
        'change-address',
        {
          orderId: 'ord_456',
          address: '1 Unauthorized Address, São Paulo',
        },
        {
          caller: {
            request: {
              headers: { authorization: 'Bearer test-customer-token' },
            },
          },
        },
      ),
    ).rejects.toThrow();
  });

  it('enforces order ownership and address eligibility at the business HTTP boundary', async () => {
    const token = 'Bearer test-customer-token';
    await request(app.getHttpServer())
      .get('/agent-tools/orders/ord_456')
      .set('Authorization', token)
      .expect(404);
    await request(app.getHttpServer())
      .patch('/agent-tools/orders/ord_456/address')
      .set('Authorization', token)
      .send({ address: '1 Unauthorized Address, São Paulo' })
      .expect(404);
    await request(app.getHttpServer())
      .patch('/agent-tools/orders/ord_123/address')
      .set('Authorization', token)
      .send({ address: '1 Ineligible Address, São Paulo' })
      .expect(404);
    await request(app.getHttpServer())
      .patch('/agent-tools/orders/ord_125/address')
      .set('Authorization', token)
      .send({ address: 'short' })
      .expect(400);
    await expect(
      callTool(
        agent,
        'find-order',
        { orderId: 'ord_123' },
        {
          caller: { user: { id: 'cus_123' } },
        },
      ),
    ).rejects.toThrow();
  });

  it('indexes seeded products and serves semantic catalog search', async () => {
    await request(app.getHttpServer())
      .post('/catalog/index')
      .set('Authorization', 'Bearer test-support-token')
      .expect(201, { indexed: 5 });

    const result = await request(app.getHttpServer())
      .get('/catalog/search')
      .query({ q: 'salmon for sensitive digestion', limit: 3 })
      .expect(200);
    expect(result.body[0]).toMatchObject({
      id: 'prod_sensitive',
      name: 'Sensitive Stomach Salmon',
    });
    expect(result.body).toHaveLength(3);

    const defaultLimit = await request(app.getHttpServer())
      .get('/catalog/search')
      .query({ q: '  salmon  ' })
      .expect(200);
    expect(defaultLimit.body).toHaveLength(5);
    await expect(
      callTool(
        agent,
        'search-products',
        { query: 'salmon for sensitive digestion' },
        {
          caller: {
            request: {
              headers: { authorization: 'Bearer test-customer-token' },
            },
          },
        },
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'prod_sensitive' }),
      ]),
    );
  });

  it('waits for refund approval, issues an idempotent simulated refund, and rejects another', async () => {
    const started = await request(app.getHttpServer())
      .post('/refunds')
      .set('Authorization', 'Bearer test-customer-token')
      .send({ orderId: 'ord_123', reason: 'The item arrived damaged.' })
      .expect(201);
    const runId = started.body.runId as string;

    // An API-only deployment must persist the request without executing it.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect((await app.get(WorkflowClient).getStatus(runId))?.status).toBe(
      'pending',
    );
    expect(
      await app.get(WorkflowClient).getStatus(runId, { journal: true }),
    ).toMatchObject({ journal: [] });
    const initialWorkerModel = new FakeModel([
      {
        toolCalls: [
          {
            name: 'issue-refund',
            input: { orderId: 'ord_123', reason: 'The item arrived damaged.' },
          },
        ],
      },
    ]);
    worker = await createWorker(initialWorkerModel);
    const approvals = await waitForApprovals(runId);
    expect(approvals).toHaveLength(1);

    await worker.close();
    worker = undefined;
    await app.close();
    const resumedWorkerModel = new FakeModel([
      'The refund was approved and simulated.',
      {
        toolCalls: [
          {
            name: 'issue-refund',
            input: {
              orderId: 'ord_124',
              reason: 'The order is no longer needed.',
            },
          },
        ],
      },
      'The refund request was rejected.',
    ]);
    app = await createApp();
    const persistedApprovals = await waitForApprovals(runId);
    expect(persistedApprovals).toHaveLength(1);

    await request(app.getHttpServer())
      .post(
        `/refunds/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvals[0].key)}`,
      )
      .set('Authorization', 'Bearer test-support-token')
      .send({ approved: true })
      .expect(201, { runId, approved: true });

    const beforeResume = await app
      .get(DataSource)
      .query<{ refunded_cents: number }[]>(
        "SELECT refunded_cents FROM payments WHERE id = 'pay_123'",
      );
    expect(beforeResume[0]?.refunded_cents).toBe(0);
    worker = await createWorker(resumedWorkerModel);

    const workflows = app.get(WorkflowClient);
    await workflows.result(runId, { timeout: '5s' });
    const completed = await workflows.getStatus(runId, { journal: true });
    expect(completed?.status).toBe('completed');
    expect(completed?.journal.some((entry) => entry.kind === 'signal')).toBe(
      true,
    );
    const database = app.get(DataSource);
    const approvedPayment = await database.query<{ refunded_cents: number }[]>(
      "SELECT refunded_cents FROM payments WHERE id = 'pay_123'",
    );
    expect(approvedPayment[0]?.refunded_cents).toBe(4599);
    const refundRows = await database.query<{ count: string }[]>(
      "SELECT count(*)::text AS count FROM payment_refunds WHERE payment_id = 'pay_123'",
    );
    expect(refundRows[0]?.count).toBe('1');
    const refund = await database.query<{ idempotency_key: string }[]>(
      "SELECT idempotency_key FROM payment_refunds WHERE payment_id = 'pay_123'",
    );
    await expect(
      worker!
        .get(PaymentsService)
        .refundOrder('cus_123', 'ord_123', refund[0]!.idempotency_key),
    ).resolves.toMatchObject({ status: 'simulated', amountCents: 4599 });
    const idempotentCount = await database.query<{ count: string }[]>(
      "SELECT count(*)::text AS count FROM payment_refunds WHERE payment_id = 'pay_123'",
    );
    expect(idempotentCount[0]?.count).toBe('1');

    const rejected = await request(app.getHttpServer())
      .post('/refunds')
      .set('Authorization', 'Bearer test-customer-token')
      .send({ orderId: 'ord_124', reason: 'The order is no longer needed.' })
      .expect(201);
    const rejectedApprovals = await waitForApprovals(rejected.body.runId);
    await request(app.getHttpServer())
      .post(
        `/refunds/${encodeURIComponent(rejected.body.runId)}/approvals/${encodeURIComponent(rejectedApprovals[0].key)}`,
      )
      .set('Authorization', 'Bearer test-support-token')
      .send({ approved: false, reason: 'Outside the refund policy.' })
      .expect(201, { runId: rejected.body.runId, approved: false });

    await app
      .get(WorkflowClient)
      .result(rejected.body.runId, { timeout: '5s' });
    const rejectedPayment = await database.query<{ refunded_cents: number }[]>(
      "SELECT refunded_cents FROM payments WHERE id = 'pay_124'",
    );
    expect(rejectedPayment[0]?.refunded_cents).toBe(0);
  }, 20_000);

  it('serializes concurrent refunds for the same order', async () => {
    const database = app.get(DataSource);
    const suffix = randomUUID();
    const paymentId = `pay-${suffix}`;
    const orderId = `ord-${suffix}`;
    await database.query(
      "INSERT INTO payments (id, amount_cents, status) VALUES ($1, 1500, 'captured')",
      [paymentId],
    );
    await database.query(
      "INSERT INTO orders (id, customer_id, payment_id, status, total_cents, delivery_address, refundable) VALUES ($1, 'cus_123', $2, 'delivered', 1500, 'Test address', true)",
      [orderId, paymentId],
    );

    try {
      const payments = worker!.get(PaymentsService);
      const results = await Promise.allSettled([
        payments.refundOrder('cus_123', orderId, `first-${suffix}`),
        payments.refundOrder('cus_123', orderId, `second-${suffix}`),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const refunds = await database.query<{ count: string }[]>(
        'SELECT count(*)::text AS count FROM payment_refunds WHERE payment_id = $1',
        [paymentId],
      );
      expect(refunds[0]?.count).toBe('1');
    } finally {
      await database.query(
        'DELETE FROM payment_refunds WHERE payment_id = $1',
        [paymentId],
      );
      await database.query('DELETE FROM orders WHERE id = $1', [orderId]);
      await database.query('DELETE FROM payments WHERE id = $1', [paymentId]);
    }
  });

  async function waitForApprovals(runId: string) {
    const support = 'Bearer test-support-token';
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await request(app.getHttpServer())
        .get(`/refunds/${encodeURIComponent(runId)}/approvals`)
        .set('Authorization', support);
      if (
        response.status === 200 &&
        Array.isArray(response.body) &&
        response.body.length
      ) {
        return response.body as Array<{ key: string }>;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
      `Refund workflow ${runId} did not request approval in time.`,
    );
  }

  async function createWorker(model: FakeModel): Promise<TestingModule> {
    const builder = Test.createTestingModule({ imports: [WorkerModule] });
    const context = await overrideModels(builder, { default: model }).compile();
    try {
      await context.init();
      return context;
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  async function createApp(): Promise<INestApplication<App>> {
    const embeddingModel = new FakeEmbeddingModel((call) => ({
      embeddings: call.values.map(fakeEmbedding),
    }));
    const builder = Test.createTestingModule({ imports: [AppModule] });
    overrideEmbeddingModels(builder, {
      default: embeddingModel,
    });
    const moduleFixture: TestingModule = await builder.compile();
    const application = moduleFixture.createNestApplication();
    try {
      await application.init();
      return application;
    } catch (error) {
      await application.close();
      throw error;
    }
  }
});
