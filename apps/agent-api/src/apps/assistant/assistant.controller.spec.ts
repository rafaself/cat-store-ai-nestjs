import { describe, expect, it, vi } from 'vitest';
import { AssistantController } from './assistant.controller';
import type { ConversationService } from './conversation.service';

describe('AssistantController', () => {
  it('delegates only the validated new message and authenticated request', async () => {
    const response = new Response('reply');
    const service = { send: vi.fn().mockResolvedValue(response) };
    const controller = new AssistantController(
      service as unknown as ConversationService,
    );
    const body = { requestId: crypto.randomUUID(), text: 'Hello' };
    const request = { headers: {}, customerId: 'customer-1' };
    const id = crypto.randomUUID();
    expect(await controller.send(id, body, request)).toBe(response);
    expect(service.send).toHaveBeenCalledWith(id, body, request);
  });
});
