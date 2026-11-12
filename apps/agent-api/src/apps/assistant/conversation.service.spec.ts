import { describe, expect, it, vi } from 'vitest';
import type { CustomerRequest } from '../../integrations/business-api/business-api.client';
import { BusinessApiClient } from '../../integrations/business-api/business-api.client';
import type { AssistantService } from './assistant.service';
import type { ChatStreamService } from './chat-stream.service';
import type { ConversationRepository } from './conversation.repository';
import { ConversationService } from './conversation.service';

describe('conversation finalization', () => {
  it('keeps the lock until started tools settle even if the provider has already failed', async () => {
    const release = vi.fn(async () => {});
    const turn = { id: crypto.randomUUID() };
    const repo = {
      acquire: vi.fn(async () => ({
        release,
        signal: new AbortController().signal,
      })),
      begin: vi.fn(async () => ({ turn, duplicate: false, history: [] })),
      tools: vi.fn(async () => []),
      executeTool: vi.fn((_session, _turn, _call, _name, _input, operation) =>
        operation(),
      ),
      finish: vi.fn(async () => {}),
    };
    let caller!: CustomerRequest;
    const assistant = {
      stream: vi.fn((_messages, request) => {
        caller = request;
        return {};
      }),
    };
    let settle!: (result: undefined, error: unknown) => Promise<void>;
    const streams = {
      open: vi.fn((_customer, start, save) => {
        start(new AbortController().signal);
        settle = save;
        return new Response();
      }),
    };
    const service = new ConversationService(
      repo as unknown as ConversationRepository,
      assistant as unknown as AssistantService,
      streams as unknown as ChatStreamService,
      {} as BusinessApiClient,
    );
    await service.send(
      crypto.randomUUID(),
      { requestId: crypto.randomUUID(), text: 'Find' },
      { headers: {}, customerId: 'cus_123' },
    );
    let complete!: (value: object) => void;
    const operation = caller.execution!.runTool(
      'call',
      'find-order',
      {},
      () =>
        new Promise<object>((resolve) => {
          complete = resolve;
        }),
    );
    const finished = settle(
      undefined,
      new Error('Provider aborted before tool completion'),
    );
    await Promise.resolve();
    expect(repo.finish).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(() =>
      caller.execution!.runTool('late', 'find-order', {}, async () => ({})),
    ).toThrow('finished');
    complete({ id: 'ord_123' });
    await operation;
    await finished;
    expect(repo.finish).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('bounds approval admission before reserving database connections and releases capacity on failure', async () => {
    let reject!: (error: Error) => void;
    const acquisition = new Promise<never>((_resolve, no) => {
      reject = no;
    });
    const repo = { acquire: vi.fn(() => acquisition) };
    const service = new ConversationService(
      repo as unknown as ConversationRepository,
      {} as AssistantService,
      {} as ChatStreamService,
      {} as BusinessApiClient,
    );
    const submit = () =>
      service.approve(
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
        { customerId: 'cus_123', headers: {} },
      );
    const active = Array.from({ length: 5 }, submit);
    const results = Promise.allSettled(active);
    await expect(submit()).rejects.toThrow('Approval capacity');
    expect(repo.acquire).toHaveBeenCalledTimes(5);
    reject(new Error('Database unavailable'));
    await results;
    await expect(submit()).rejects.toThrow('Database unavailable');
    expect(repo.acquire).toHaveBeenCalledTimes(6);
  });
});
