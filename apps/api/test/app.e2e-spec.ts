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
import { DatabaseService } from '@llm-chatbot-nestjs/database';
import { PaymentsService } from '../src/payments/payments.service';

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

  beforeAll(async () => {
    fakeModel = new FakeModel([
      'Hello from the offline fake model.',
      {
        toolCalls: [
          {
            name: 'issue-refund',
            input: { orderId: 'ord_123', reason: 'The item arrived damaged.' },
          },
        ],
      },
    ]);
    app = await createApp(fakeModel);

    const database = app.get(DatabaseService);
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
    await app.close();
  });

  it('serves health and requires demo authentication on chat', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok' });
    await request(app.getHttpServer())
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

  it('streams a chat reply through the fake language model', async () => {
    const response = await request(app.getHttpServer())
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

  it('scopes order tools to the authenticated customer and allows eligible address changes', async () => {
    await expect(
      callTool(
        app,
        'find-order',
        { orderId: 'ord_456' },
        {
          caller: { user: { id: 'cus_123' } },
        },
      ),
    ).rejects.toThrow();

    await expect(
      callTool(
        app,
        'change-address',
        {
          orderId: 'ord_125',
          address: '99 New Address, São Paulo',
        },
        { caller: { user: { id: 'cus_123' } } },
      ),
    ).resolves.toMatchObject({ deliveryAddress: '99 New Address, São Paulo' });

    await expect(
      callTool(
        app,
        'change-address',
        {
          orderId: 'ord_456',
          address: '1 Unauthorized Address, São Paulo',
        },
        { caller: { user: { id: 'cus_123' } } },
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
  });

  it('waits for refund approval, issues an idempotent simulated refund, and rejects another', async () => {
    const started = await request(app.getHttpServer())
      .post('/refunds')
      .set('Authorization', 'Bearer test-customer-token')
      .send({ orderId: 'ord_123', reason: 'The item arrived damaged.' })
      .expect(201);
    const runId = started.body.runId as string;

    const approvals = await waitForApprovals(runId);
    expect(approvals).toHaveLength(1);

    await app.close();
    fakeModel = new FakeModel([
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
    app = await createApp(fakeModel);
    const persistedApprovals = await waitForApprovals(runId);
    expect(persistedApprovals).toHaveLength(1);

    await request(app.getHttpServer())
      .post(
        `/refunds/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvals[0].key)}`,
      )
      .set('Authorization', 'Bearer test-support-token')
      .send({ approved: true })
      .expect(201, { runId, approved: true });

    const workflows = app.get(WorkflowClient);
    await workflows.result(runId, { timeout: '5s' });
    const completed = await workflows.getStatus(runId, { journal: true });
    expect(completed?.status).toBe('completed');
    expect(completed?.journal.some((entry) => entry.kind === 'signal')).toBe(
      true,
    );
    const database = app.get(DatabaseService);
    const approvedPayment = await database.query<{ refunded_cents: number }>(
      "SELECT refunded_cents FROM payments WHERE id = 'pay_123'",
    );
    expect(approvedPayment.rows[0]?.refunded_cents).toBe(4599);
    const refundRows = await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM payment_refunds WHERE payment_id = 'pay_123'",
    );
    expect(refundRows.rows[0]?.count).toBe('1');
    const refund = await database.query<{ idempotency_key: string }>(
      "SELECT idempotency_key FROM payment_refunds WHERE payment_id = 'pay_123'",
    );
    await expect(
      app
        .get(PaymentsService)
        .refundOrder('cus_123', 'ord_123', refund.rows[0]!.idempotency_key),
    ).resolves.toMatchObject({ status: 'simulated', amountCents: 4599 });
    const idempotentCount = await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM payment_refunds WHERE payment_id = 'pay_123'",
    );
    expect(idempotentCount.rows[0]?.count).toBe('1');

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
    const rejectedPayment = await database.query<{ refunded_cents: number }>(
      "SELECT refunded_cents FROM payments WHERE id = 'pay_124'",
    );
    expect(rejectedPayment.rows[0]?.refunded_cents).toBe(0);
  }, 20_000);

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

  async function createApp(model: FakeModel): Promise<INestApplication<App>> {
    const embeddingModel = new FakeEmbeddingModel((call) => ({
      embeddings: call.values.map(fakeEmbedding),
    }));
    const builder = Test.createTestingModule({ imports: [AppModule] });
    overrideEmbeddingModels(overrideModels(builder, { default: model }), {
      default: embeddingModel,
    });
    const moduleFixture: TestingModule = await builder.compile();
    const application = moduleFixture.createNestApplication();
    await application.init();
    return application;
  }
});
