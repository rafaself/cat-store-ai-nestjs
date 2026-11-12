import {
  FakeEmbeddingModel,
  FakeModel,
  callTool,
  overrideEmbeddingModels,
  overrideModels,
} from '@nestjs/ai/testing';
import { ConflictException, INestApplication } from '@nestjs/common';
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
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import {
  addressChangeProposalSchema,
  chatRequestSchema,
} from '@cat-supplies-store/contracts';

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

    // Reconstruct the same UIMessage the browser stores from the SSE stream.
    const chunks = response.text
      .split('\n')
      .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
      .map((line) => JSON.parse(line.slice(6)) as UIMessageChunk);
    let assistantMessage: UIMessage | undefined;
    for await (const message of readUIMessageStream({
      message: { id: 'assistant-reply', role: 'assistant', parts: [] },
      stream: new ReadableStream<UIMessageChunk>({
        start(controller) {
          chunks.forEach((chunk) => controller.enqueue(chunk));
          controller.close();
        },
      }),
      terminateOnError: true,
    })) {
      assistantMessage = message;
    }
    expect(assistantMessage?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'step-start' }),
        expect.objectContaining({
          type: 'tool-find-order',
          state: 'output-available',
          input: { orderId: 'ord_123' },
          output: expect.objectContaining({ id: 'ord_123' }),
        }),
      ]),
    );
    fakeModel.reply('It was delivered to your demo address.');
    const followUp = await request(agent.getHttpServer())
      .post('/assistant/chat')
      .set('Authorization', 'Bearer test-customer-token')
      .send({
        messages: [
          {
            id: 'tool-message',
            role: 'user',
            parts: [{ type: 'text', text: 'Find my order ord_123' }],
          },
          assistantMessage,
          {
            id: 'follow-up',
            role: 'user',
            parts: [{ type: 'text', text: 'Where was it delivered?' }],
          },
        ],
      })
      .expect(200);
    expect(followUp.text).toContain('"delta":"address."');
    expect(fakeModel.lastCall?.lastUserMessage).toBe('Where was it delivered?');
    expect(fakeModel.lastCall?.options.prompt).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'tool-result',
              toolName: 'find-order',
              output: expect.objectContaining({
                value: expect.objectContaining({ id: 'ord_123' }),
              }),
            }),
          ]),
        }),
      ]),
    );
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

    const proposal = addressChangeProposalSchema.parse(
      await callTool(
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
    );
    const caller = {
      request: { headers: { authorization: 'Bearer test-customer-token' } },
    };
    expect(
      await callTool(agent, 'find-order', { orderId: 'ord_125' }, { caller }),
    ).toMatchObject({ deliveryAddress: '123 Demo Street, São Paulo' });
    const confirmedInput = {
      orderId: proposal.orderId,
      address: proposal.address,
      confirmationId: proposal.confirmationId,
    };
    await expect(
      callTool(agent, 'change-address', confirmedInput, { caller }),
    ).rejects.toThrow();
    await request(app.getHttpServer())
      .post(
        `/agent-tools/address-confirmations/${proposal.confirmationId}/approve`,
      )
      .set('Authorization', 'Bearer test-customer-token')
      .send({
        approved: true,
        orderId: proposal.orderId,
        address: proposal.address,
      })
      .expect(201);
    await expect(
      callTool(agent, 'change-address', confirmedInput, { caller }),
    ).resolves.toMatchObject({ deliveryAddress: proposal.address });
    await expect(
      callTool(agent, 'change-address', confirmedInput, { caller }),
    ).rejects.toThrow();
    // Proposal and execution parts must remain valid on subsequent chat turns.
    expect(
      chatRequestSchema.safeParse({
        messages: [
          {
            id: 'proposal',
            role: 'assistant',
            parts: [
              {
                type: 'tool-change-address',
                toolCallId: 'proposal',
                state: 'output-available',
                input: { orderId: proposal.orderId, address: proposal.address },
                output: proposal,
              },
            ],
          },
          {
            id: 'user',
            role: 'user',
            parts: [{ type: 'text', text: 'Confirmed with the button' }],
          },
        ],
      }).success,
    ).toBe(true);

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
      .post('/agent-tools/orders/ord_456/address-confirmations')
      .set('Authorization', token)
      .send({ address: '1 Unauthorized Address, São Paulo' })
      .expect(404);
    await request(app.getHttpServer())
      .post('/agent-tools/orders/ord_123/address-confirmations')
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

  it('binds single-use address approvals to the customer, order, address, and expiration', async () => {
    const token = 'Bearer test-customer-token';
    const database = app.get(DataSource);
    const address = '77 Explicitly Confirmed Street';
    const propose = async () => {
      const response = await request(app.getHttpServer())
        .post('/agent-tools/orders/ord_125/address-confirmations')
        .set('Authorization', token)
        .send({ address })
        .expect(201);
      return addressChangeProposalSchema.parse(response.body);
    };
    const approve = (id: string) =>
      request(app.getHttpServer())
        .post(`/agent-tools/address-confirmations/${id}/approve`)
        .set('Authorization', token)
        .send({ approved: true, orderId: 'ord_125', address });
    const mutate = (
      id: string,
      orderId = 'ord_125',
      proposedAddress = address,
    ) =>
      request(app.getHttpServer())
        .patch(`/agent-tools/orders/${orderId}/address`)
        .set('Authorization', token)
        .send({ address: proposedAddress, confirmationId: id });
    const original = await request(app.getHttpServer())
      .get('/agent-tools/orders/ord_125')
      .set('Authorization', token)
      .expect(200);
    const unchanged = async () => {
      const response = await request(app.getHttpServer())
        .get('/agent-tools/orders/ord_125')
        .set('Authorization', token)
        .expect(200);
      expect(response.body.deliveryAddress).toBe(original.body.deliveryAddress);
    };

    const proposal = await propose();
    await unchanged();
    await request(app.getHttpServer())
      .patch('/agent-tools/orders/ord_125/address')
      .set('Authorization', token)
      .send({ address })
      .expect(400);
    await mutate(randomUUID()).expect(403);
    await mutate(proposal.confirmationId).expect(403);
    await request(app.getHttpServer())
      .post(
        `/agent-tools/address-confirmations/${proposal.confirmationId}/approve`,
      )
      .send({ approved: true })
      .expect(401);
    await request(app.getHttpServer())
      .post(
        `/agent-tools/address-confirmations/${proposal.confirmationId}/approve`,
      )
      .set('Authorization', token)
      .send({ approved: false, orderId: 'ord_125', address })
      .expect(400);
    await mutate(proposal.confirmationId).expect(403);
    // A confirmation issued to another customer cannot be approved or used.
    for (const mismatched of [
      { approved: true, orderId: 'ord_456', address },
      {
        approved: true,
        orderId: 'ord_125',
        address: '88 Different Approval Street',
      },
    ]) {
      await request(app.getHttpServer())
        .post(
          `/agent-tools/address-confirmations/${proposal.confirmationId}/approve`,
        )
        .set('Authorization', token)
        .send(mismatched)
        .expect(403);
    }
    await database.query(
      'UPDATE address_change_confirmations SET customer_id = $1 WHERE id = $2',
      ['cus_456', proposal.confirmationId],
    );
    await approve(proposal.confirmationId).expect(403);
    await database.query(
      'UPDATE address_change_confirmations SET approved_at = CURRENT_TIMESTAMP WHERE id = $1',
      [proposal.confirmationId],
    );
    await mutate(proposal.confirmationId).expect(403);

    const expired = await propose();
    await database.query(
      "UPDATE address_change_confirmations SET expires_at = CURRENT_TIMESTAMP - interval '1 second' WHERE id = $1",
      [expired.confirmationId],
    );
    await approve(expired.confirmationId).expect(403);
    await mutate(expired.confirmationId).expect(403);
    const approvedExpired = await propose();
    await approve(approvedExpired.confirmationId).expect(201);
    await database.query(
      "UPDATE address_change_confirmations SET expires_at = CURRENT_TIMESTAMP - interval '1 second' WHERE id = $1",
      [approvedExpired.confirmationId],
    );
    await mutate(approvedExpired.confirmationId).expect(403);

    const approved = await propose();
    await approve(approved.confirmationId).expect(201);
    await approve(approved.confirmationId).expect(403);
    await mutate(approved.confirmationId, 'ord_456').expect(403);
    await mutate(
      approved.confirmationId,
      'ord_125',
      '88 Unapproved Replacement Street',
    ).expect(403);
    await unchanged();
    // Approval does not override eligibility or ownership changes after the proposal.
    await database.query(
      "UPDATE orders SET status = 'delivered' WHERE id = 'ord_125'",
    );
    try {
      await mutate(approved.confirmationId).expect(404);
      await unchanged();
    } finally {
      await database.query(
        "UPDATE orders SET status = 'processing' WHERE id = 'ord_125'",
      );
    }
    await database.query(
      "UPDATE orders SET customer_id = 'cus_456' WHERE id = 'ord_125'",
    );
    try {
      await mutate(approved.confirmationId).expect(404);
    } finally {
      await database.query(
        "UPDATE orders SET customer_id = 'cus_123' WHERE id = 'ord_125'",
      );
    }
    const results = await Promise.all([
      mutate(approved.confirmationId),
      mutate(approved.confirmationId),
    ]);
    expect(
      results.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 403]);
    expect(
      results.find((response) => response.status === 200)?.body.deliveryAddress,
    ).toBe(address);
    await mutate(approved.confirmationId).expect(403);
    await approve(approved.confirmationId).expect(403);
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

  it('rejects an approved refund tool call for a different order owned by the same customer', async () => {
    const database = app.get(DataSource);
    const started = await request(app.getHttpServer())
      .post('/refunds')
      .set('Authorization', 'Bearer test-customer-token')
      .send({ orderId: 'ord_123', reason: 'The item arrived damaged.' })
      .expect(201);
    const runId = started.body.runId as string;
    const model = new FakeModel([
      {
        toolCalls: [
          {
            name: 'issue-refund',
            input: {
              orderId: 'ord_124',
              reason: 'Refund another order instead.',
            },
          },
        ],
      },
      'The refund was not executed.',
    ]);
    worker = await createWorker(model);
    try {
      const approvals = await waitForApprovals(runId);
      expect(approvals).toHaveLength(1);
      const before = await database.query<
        { id: string; refunded_cents: number }[]
      >(
        "SELECT id, refunded_cents FROM payments WHERE id IN ('pay_123', 'pay_124') ORDER BY id",
      );
      expect(before.map((payment) => payment.refunded_cents)).toEqual([0, 0]);
      await request(app.getHttpServer())
        .post(
          `/refunds/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvals[0].key)}`,
        )
        .set('Authorization', 'Bearer test-support-token')
        .send({ approved: true })
        .expect(201);
      await app.get(WorkflowClient).result(runId, { timeout: '5s' });
      expect(model.lastCall?.toolResults).toEqual([
        expect.objectContaining({
          toolName: 'issue-refund',
          output: expect.any(String),
        }),
      ]);
      const after = await database.query<
        { id: string; refunded_cents: number }[]
      >(
        "SELECT id, refunded_cents FROM payments WHERE id IN ('pay_123', 'pay_124') ORDER BY id",
      );
      expect(after).toEqual(before);
      const refunds = await database.query<{ count: string }[]>(
        "SELECT count(*)::text AS count FROM payment_refunds WHERE payment_id IN ('pay_123', 'pay_124')",
      );
      expect(refunds[0]?.count).toBe('0');
    } finally {
      await worker.close();
      worker = undefined;
    }
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
    const pending = await app.get(WorkflowClient).getStatus(runId);
    expect(pending).toMatchObject({
      workflow: 'refund-request',
      version: 1,
      status: 'pending',
    });
    expect(pending!.deadline! - pending!.createdAt).toBe(
      7 * 24 * 60 * 60 * 1000,
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

  it.each(['sequential', 'concurrent'] as const)(
    'prevents duplicate full refunds with different keys (%s)',
    async (mode) => {
      const database = app.get(DataSource);
      const suffix = randomUUID();
      const paymentId = `pay-${suffix}`;
      const orderId = `ord-${suffix}`;
      await database.query(
        // Enough balance for two order-sized refunds: balance checks alone must not authorize a second one.
        "INSERT INTO payments (id, amount_cents, status) VALUES ($1, 3000, 'captured')",
        [paymentId],
      );
      await database.query(
        "INSERT INTO orders (id, customer_id, payment_id, status, total_cents, delivery_address, refundable) VALUES ($1, 'cus_123', $2, 'delivered', 1500, 'Test address', true)",
        [orderId, paymentId],
      );

      try {
        const payments = worker!.get(PaymentsService);
        const first = () =>
          payments.refundOrder('cus_123', orderId, `first-${suffix}`);
        const second = () =>
          payments.refundOrder('cus_123', orderId, `second-${suffix}`);
        const results =
          mode === 'concurrent'
            ? await Promise.allSettled([first(), second()])
            : [
                ...(await Promise.allSettled([first()])),
                ...(await Promise.allSettled([second()])),
              ];
        expect(
          results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
          results.filter((result) => result.status === 'rejected'),
        ).toHaveLength(1);
        const failure = results.find((result) => result.status === 'rejected');
        expect(failure?.reason).toBeInstanceOf(ConflictException);
        const success = results.find((result) => result.status === 'fulfilled');
        expect(success).toBeDefined();
        const originalRefund = success!.value;
        // Both sequential and concurrent same-key retries return the original refund.
        const retries = await Promise.all([
          payments.refundOrder(
            'cus_123',
            orderId,
            originalRefund.idempotencyKey,
          ),
          payments.refundOrder(
            'cus_123',
            orderId,
            originalRefund.idempotencyKey,
          ),
        ]);
        expect(retries).toEqual([originalRefund, originalRefund]);
        // The migration also prevents bypassing the repository's domain check.
        await expect(
          database.query(
            'INSERT INTO payment_refunds (idempotency_key, payment_id, amount_cents) VALUES ($1, $2, 1500)',
            [`bypass-${suffix}`, paymentId],
          ),
        ).rejects.toMatchObject({
          driverError: {
            code: '23505',
            constraint: 'payment_refunds_payment_id_key',
          },
        });
        const refunds = await database.query<
          { count: string; amount: string }[]
        >(
          'SELECT count(*)::text AS count, sum(amount_cents)::text AS amount FROM payment_refunds WHERE payment_id = $1',
          [paymentId],
        );
        expect(refunds).toEqual([{ count: '1', amount: '1500' }]);
        const payment = await database.query<
          { refunded_cents: number; status: string }[]
        >('SELECT refunded_cents, status FROM payments WHERE id = $1', [
          paymentId,
        ]);
        expect(payment).toEqual([
          { refunded_cents: 1500, status: 'partially_refunded' },
        ]);
      } finally {
        await database.query(
          'DELETE FROM payment_refunds WHERE payment_id = $1',
          [paymentId],
        );
        await database.query('DELETE FROM orders WHERE id = $1', [orderId]);
        await database.query('DELETE FROM payments WHERE id = $1', [paymentId]);
      }
    },
  );

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
