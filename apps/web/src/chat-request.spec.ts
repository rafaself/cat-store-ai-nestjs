import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { chatRequestSchema } from '@cat-supplies-store/contracts';
import { prepareChatRequest } from './chat-request.js';

describe('prepareChatRequest', () => {
  it('sends text history while retaining tool results locally for display', () => {
    const tool = {
      type: 'tool-change-address' as const,
      toolCallId: 'call',
      state: 'output-available' as const,
      input: { orderId: 'ord_123', address: '123 Demo Street' },
      output: { confirmationId: 'confirmation-1' },
    };
    const messages: UIMessage[] = [
      {
        id: 'user',
        role: 'user',
        parts: [{ type: 'text', text: 'Change my address' }],
      },
      {
        id: 'tool-only',
        role: 'assistant',
        parts: [{ type: 'step-start' }, tool],
      },
      {
        id: 'assistant',
        role: 'assistant',
        parts: [
          tool,
          { type: 'reasoning', text: 'Private reasoning', state: 'done' },
          { type: 'text', text: 'Please confirm.', state: 'done' },
        ],
      },
      {
        id: 'partial',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Partial', state: 'streaming' }],
      },
      {
        id: 'next',
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'Confirmed with confirmationId: confirmation-1',
          },
        ],
      },
    ];
    const original = structuredClone(messages);
    const request = prepareChatRequest(messages);

    expect(request.messages).toEqual([
      messages[0],
      {
        id: 'assistant',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Please confirm.', state: 'done' }],
      },
      messages[4],
    ]);
    expect(chatRequestSchema.safeParse(request).success).toBe(true);
    expect(messages).toEqual(original);
  });
});
