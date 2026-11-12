import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerAuthGuard } from '../../auth/customer-auth.guard';
import { AssistantController } from './assistant.controller';
import { ConversationService } from './conversation.service';

const input = { requestId: crypto.randomUUID(), text: 'Hello' };
describe('Conversation HTTP boundary', () => {
  let app: NestExpressApplication;
  let url: string;
  const service = {
    send: vi.fn(async () => new Response('reply')),
    create: vi.fn(),
  };
  const auth = vi.fn((context) => {
    context.switchToHttp().getRequest().customerId = 'cus_123';
    return true;
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AssistantController],
      providers: [{ provide: ConversationService, useValue: service }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CustomerAuthGuard)
      .useValue({ canActivate: auth })
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    app.useBodyParser('json', { limit: '100kb' });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/assistant/conversations/${crypto.randomUUID()}/messages`;
  });
  afterEach(async () => {
    await app.close();
  });
  async function post(payload: unknown) {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
  it('accepts a new user message', async () => {
    const response = await post(input);
    expect(response.status).toBe(200);
    await response.text();
    expect(service.send).toHaveBeenCalledWith(
      expect.any(String),
      input,
      expect.objectContaining({ customerId: 'cus_123' }),
    );
  });
  it.each([
    { ...input, messages: [] },
    { ...input, role: 'assistant' },
    { ...input, toolCalls: [] },
    { ...input, text: 'x'.repeat(4_001) },
  ])('rejects forged/invalid payloads before execution %#', async (payload) => {
    const response = await post(payload);
    expect(response.status).toBe(400);
    await response.text();
    expect(service.send).not.toHaveBeenCalled();
  });
  it.each(['x'.repeat(102_400), '🐈'.repeat(30_000)])(
    'enforces the byte limit before authentication',
    async (ignored) => {
      const response = await post({ ...input, ignored });
      expect(response.status).toBe(413);
      await response.text();
      expect(auth).not.toHaveBeenCalled();
    },
  );
});
