import { AiModule } from '@nestjs/ai';
import { FakeModel } from '@nestjs/ai/testing';
import {
  StandardSchemaValidationPipe,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessApiClient } from '../../integrations/business-api/business-api.client';
import { AssistantModule } from './assistant.module';

const body = {
  messages: [
    { id: 'one', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
  ],
};

describe('Assistant native HTTP streaming (offline)', () => {
  let app: INestApplication;
  let model: FakeModel;
  let url: string;
  const business = {
    authenticate: vi.fn(
      async (request: { headers: { authorization?: string } }) => {
        if (request.headers.authorization !== 'Bearer customer-token') {
          throw new UnauthorizedException();
        }
        return { id: 'customer-1' };
      },
    ),
    findOrder: vi.fn(async () => ({ id: 'ord_123', status: 'delivered' })),
  };

  beforeEach(async () => {
    model = new FakeModel();
    const module = await Test.createTestingModule({
      imports: [
        AiModule.forRoot({
          isGlobal: true,
          models: { default: model },
          defaults: { retry: false, timeout: false, maxOutputTokens: 800 },
        }),
        AssistantModule,
      ],
    })
      .overrideProvider(BusinessApiClient)
      .useValue(business)
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/assistant/chat`;
  });

  afterEach(async () => {
    await app?.close();
  });

  function chat(
    signal?: AbortSignal,
    payload: unknown = body,
    token = 'customer-token',
  ) {
    return fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });
  }

  it('preserves status, UI protocol, tools and completion', async () => {
    model.reply(
      { toolCalls: [{ name: 'find-order', input: { orderId: 'ord_123' } }] },
      'Your order arrived.',
    );
    const response = await chat();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');
    const text = await response.text();
    expect(text).toContain('tool-output-available');
    expect(text).toContain('ord_123');
    expect(text).toContain('"type":"finish"');
    expect(text).toContain('data: [DONE]');
    expect(model.calls).toHaveLength(2);
    expect(model.calls[0]!.options.maxOutputTokens).toBe(800);
  });

  it('rejects authentication and validation failures before starting the model', async () => {
    const unauthorized = await chat(undefined, body, 'bad-token');
    expect(unauthorized.status).toBe(401);
    await unauthorized.text();
    const invalid = await chat(undefined, { messages: [] });
    expect(invalid.status).toBe(400);
    await invalid.text();
    expect(model.calls).toHaveLength(0);
  });

  it.each([false, true])(
    'sanitizes generation errors (after content: %s)',
    async (afterContent) => {
      model.reply(
        afterContent
          ? {
              text: 'Partial reply.',
              streamError: new Error('private provider detail'),
            }
          : new Error('private provider detail'),
      );
      const response = await chat();
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('An error occurred while generating a response.');
      expect(text).not.toContain('private provider detail');
      if (afterContent) expect(text).toContain('"delta":"Partial "');
    },
  );

  it.each([false, true])(
    'aborts provider work on HTTP disconnect (after content: %s)',
    async (afterContent) => {
      model.reply(
        afterContent
          ? {
              text: 'A long reply with several words to keep streaming.',
              chunkDelay: 100,
            }
          : { text: 'Delayed reply.', delay: 30_000 },
      );
      const abort = new AbortController();
      const pending = chat(abort.signal);
      // Observe rejection immediately, including the before-headers disconnect case.
      const settled = pending.catch(() => undefined);
      await vi.waitFor(() => expect(model.calls).toHaveLength(1));
      if (afterContent) {
        const response = await pending;
        const reader = response.body!.getReader();
        const chunk = await reader.read();
        expect(chunk.done).toBe(false);
        reader.releaseLock();
      }
      abort.abort();
      await settled;
      await vi.waitFor(() =>
        expect(model.calls[0]!.options.abortSignal?.aborted).toBe(true),
      );
    },
  );

  it('rejects a second active chat for the authenticated customer without starting more work', async () => {
    model.reply({ text: 'Delayed reply.', delay: 30_000 });
    const abort = new AbortController();
    const first = chat(abort.signal).catch(() => undefined);
    await vi.waitFor(() => expect(model.calls).toHaveLength(1));
    const second = await chat();
    expect(second.status).toBe(429);
    await second.text();
    expect(model.calls).toHaveLength(1);
    abort.abort();
    await first;
    await vi.waitFor(() =>
      expect(model.calls[0]!.options.abortSignal?.aborted).toBe(true),
    );
  });

  it('stops a repeated tool loop after four model calls', async () => {
    for (let i = 0; i < 5; i++) {
      model.reply({
        toolCalls: [{ name: 'find-order', input: { orderId: 'ord_123' } }],
      });
    }
    const response = await chat();
    const text = await response.text();
    expect(model.calls).toHaveLength(4);
    expect(text).toContain('"type":"finish","finishReason":"tool-calls"');
    expect(text).toContain('data: [DONE]');
  });
});
