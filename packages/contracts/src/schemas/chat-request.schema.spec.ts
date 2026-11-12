import { describe, expect, it } from 'vitest';
import { chatRequestSchema } from './chat-request.schema.js';

const user = {
  id: 'user',
  role: 'user',
  parts: [{ type: 'text', text: 'Hello' }],
};
const order = {
  id: 'ord_123',
  status: 'delivered',
  totalCents: 4599,
  deliveryAddress: '123 Demo Street',
  refundable: true,
};
const tool = {
  type: 'tool-find-order',
  toolCallId: 'call-1',
  state: 'output-available',
  input: { orderId: 'ord_123' },
  output: order,
};
function history(part: unknown) {
  return {
    messages: [
      user,
      { id: 'assistant', role: 'assistant', parts: [part] },
      user,
    ],
  };
}

describe('chatRequestSchema', () => {
  it.each([
    tool,
    {
      ...tool,
      type: 'tool-change-address',
      input: { orderId: 'ord_123', address: '456 New Street' },
    },
    {
      ...tool,
      type: 'tool-search-products',
      input: { query: 'cat toys' },
      output: [
        {
          id: 'toy',
          name: 'Toy',
          description: 'Feather',
          priceCents: 100,
          similarity: 1,
        },
      ],
    },
    {
      type: 'tool-find-order',
      toolCallId: 'error',
      state: 'output-error',
      input: { orderId: 'missing' },
      errorText: 'Not found',
    },
    { type: 'step-start' },
    { type: 'reasoning', text: 'I should find the order.', state: 'done' },
  ])('accepts supported assistant history: $type $state', (part) => {
    expect(chatRequestSchema.safeParse(history(part)).success).toBe(true);
  });

  it.each([
    { ...tool, type: 'tool-issue-refund' },
    { ...tool, type: 'dynamic-tool', toolName: 'find-order' },
    { ...tool, input: { orderId: 123 } },
    { ...tool, input: { orderId: 'x'.repeat(81) } },
    { ...tool, input: { orderId: 'ord_123', customerId: 'other' } },
    { ...tool, output: { ...order, totalCents: '4599' } },
    { ...tool, output: null },
    { ...tool, state: 'output-error' },
    { ...tool, state: 'input-streaming' },
    { ...tool, state: 'input-available' },
    { ...tool, providerExecuted: true },
    {
      ...tool,
      type: 'tool-change-address',
      input: { orderId: 'ord_123', address: 'short' },
    },
    {
      ...tool,
      type: 'tool-search-products',
      input: { query: '  ' },
      output: [],
    },
    {
      ...tool,
      type: 'tool-search-products',
      input: { query: 'toys' },
      output: [{}],
    },
    { type: 'file', mediaType: 'text/plain', url: 'http://localhost/private' },
  ])('rejects unsupported or malformed history %#', (part) => {
    expect(chatRequestSchema.safeParse(history(part)).success).toBe(false);
  });

  it('keeps user messages text-only and requires a final user message', () => {
    expect(
      chatRequestSchema.safeParse({ messages: [{ ...user, parts: [tool] }] })
        .success,
    ).toBe(false);
    expect(
      chatRequestSchema.safeParse({
        messages: history(tool).messages.slice(0, -1),
      }).success,
    ).toBe(false);
  });

  it('preserves the message count and text content limits', () => {
    expect(chatRequestSchema.safeParse({ messages: [] }).success).toBe(false);
    expect(
      chatRequestSchema.safeParse({ messages: Array(40).fill(user) }).success,
    ).toBe(true);
    expect(
      chatRequestSchema.safeParse({ messages: Array(41).fill(user) }).success,
    ).toBe(false);
    for (const length of [20_000, 20_001]) {
      expect(
        chatRequestSchema.safeParse({
          messages: [
            { ...user, parts: [{ type: 'text', text: 'x'.repeat(length) }] },
          ],
        }).success,
      ).toBe(length === 20_000);
    }
  });

  it('counts tool payloads, error text, and reasoning toward the content limit', () => {
    for (const part of [
      { ...tool, output: { ...order, deliveryAddress: 'x'.repeat(20_000) } },
      {
        type: 'tool-find-order',
        toolCallId: 'error',
        state: 'output-error',
        errorText: 'x'.repeat(20_000),
      },
      { type: 'reasoning', text: 'x'.repeat(20_000) },
      { ...tool, toolCallId: 'x'.repeat(20_000) },
    ]) {
      expect(chatRequestSchema.safeParse(history(part)).success).toBe(false);
    }
  });
});
