import { describe, expect, it, vi } from 'vitest';
import { AssistantController } from './assistant.controller';
import type { AssistantService } from './assistant.service';
import type { ChatStreamService } from './chat-stream.service';

const body = {
  messages: [
    {
      id: 'one',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'Hello' }],
    },
  ],
};

describe('AssistantController', () => {
  it('returns a web response for the authenticated customer with converted messages', async () => {
    const generation = {};
    const assistant = { stream: vi.fn().mockReturnValue(generation) };
    const signal = new AbortController().signal;
    const response = new Response('reply');
    const streams = {
      open: vi.fn((_id, start) => {
        expect(start(signal)).toBe(generation);
        return response;
      }),
    };
    const controller = new AssistantController(
      assistant as unknown as AssistantService,
      streams as unknown as ChatStreamService,
    );
    const request = { headers: {}, customerId: 'customer-1' };
    expect(await controller.chat(body, request)).toBe(response);
    expect(streams.open).toHaveBeenCalledWith(
      'customer-1',
      expect.any(Function),
    );
    expect(assistant.stream).toHaveBeenCalledWith(
      [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      request,
      signal,
    );
  });

  it('refuses to generate without authenticated identity', async () => {
    const assistant = { stream: vi.fn() };
    const streams = { open: vi.fn() };
    const controller = new AssistantController(
      assistant as unknown as AssistantService,
      streams as unknown as ChatStreamService,
    );
    await expect(controller.chat(body, { headers: {} })).rejects.toThrow(
      'Unauthorized',
    );
    expect(streams.open).not.toHaveBeenCalled();
  });
});
