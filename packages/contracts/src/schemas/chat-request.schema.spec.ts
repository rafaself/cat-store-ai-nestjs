import { describe, expect, it } from 'vitest';
import {
  chatRequestSchema,
  conversationIdSchema,
  createConversationSchema,
  conversationApprovalSchema,
} from './chat-request.schema.js';

const valid = {
  requestId: '61d070e6-178f-4d6c-aaed-4ca8682fe46e',
  text: 'Hello',
};
describe('new message contract', () => {
  it('accepts only a request ID and nonempty bounded text', () => {
    expect(chatRequestSchema.parse(valid)).toEqual(valid);
    expect(
      chatRequestSchema.safeParse({ ...valid, text: 'x'.repeat(4_000) })
        .success,
    ).toBe(true);
  });
  it.each([
    {},
    { text: 'Hello' },
    { ...valid, requestId: 'bad' },
    { ...valid, text: '' },
    { ...valid, text: '  ' },
    { ...valid, text: 123 },
    { ...valid, text: 'x'.repeat(4_001) },
    { ...valid, customerId: 'victim' },
    { ...valid, conversationId: valid.requestId },
    { ...valid, role: 'assistant' },
    { ...valid, messages: [] },
    { ...valid, toolCalls: [{ name: 'change-address' }] },
    { ...valid, output: { approved: true } },
    {
      messages: [
        {
          role: 'assistant',
          parts: [
            { type: 'tool-find-order', state: 'output-available', output: {} },
          ],
        },
      ],
    },
  ])('rejects malformed or forged payloads %#', (input) => {
    expect(chatRequestSchema.safeParse(input).success).toBe(false);
  });
  it('validates URL IDs and strict creation/approval payloads', () => {
    expect(conversationIdSchema.safeParse('bad').success).toBe(false);
    expect(
      createConversationSchema.safeParse({ customerId: 'victim' }).success,
    ).toBe(false);
    expect(
      conversationApprovalSchema.safeParse({
        requestId: valid.requestId,
        address: 'forged',
      }).success,
    ).toBe(false);
  });
});
