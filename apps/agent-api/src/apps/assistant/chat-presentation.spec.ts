import { describe, expect, it } from 'vitest';
import type { UIMessage, UIMessageChunk } from 'ai';
import { readUIMessageStream } from 'ai';
import { publicChatMessageSchema } from '@cat-supplies-store/contracts';
import { publicChatStream, publicMessages } from './chat-presentation';

const proposal = {
  status: 'confirmation-required',
  confirmationId: '4cc4047e-ce51-41a1-a996-e4b9ed8ca6fe',
  orderId: 'ord_125',
  address: '123 New Street',
  expiresAt: '2026-11-13T10:00:00.000Z',
};
const approval = {
  confirmationId: proposal.confirmationId,
  orderId: proposal.orderId,
  address: proposal.address,
  expiresAt: proposal.expiresAt,
};
async function project(chunks: UIMessageChunk[]) {
  const stream = publicChatStream(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    'server-message',
  );
  const output: UIMessageChunk[] = [];
  for await (const chunk of stream) output.push(chunk);
  return output;
}

describe('public chat boundary', () => {
  it('keeps only display text and explicit approval fields in old stored snapshots', () => {
    const messages: UIMessage[] = [
      {
        id: 'reply',
        role: 'assistant',
        metadata: { secret: 'private metadata' },
        parts: [
          {
            type: 'text',
            text: 'Your order arrived.',
            providerMetadata: { private: { secret: true } },
          },
          { type: 'reasoning', text: 'private reasoning' },
          {
            type: 'tool-find-order',
            toolCallId: 'private-call',
            state: 'output-available',
            input: { orderId: 'ord_123' },
            output: { deliveryAddress: 'private original address' },
          },
          {
            type: 'tool-change-address',
            toolCallId: 'approval-call',
            state: 'output-available',
            input: { secret: true },
            output: proposal,
          },
          { type: 'data-secret', data: 'private data' },
        ],
      },
    ];
    expect(publicMessages(messages)).toEqual([
      {
        id: 'reply',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Your order arrived.' },
          {
            type: 'data-address-approval',
            id: proposal.confirmationId,
            data: approval,
          },
        ],
      },
    ]);
    expect(JSON.stringify(publicMessages(messages))).not.toContain('private');
    expect(
      publicChatMessageSchema.safeParse(publicMessages(messages)[0]).success,
    ).toBe(true);
  });

  it('omits internal-only and empty messages and rejects malformed approval output', () => {
    expect(
      publicMessages([
        {
          id: 'system',
          role: 'system',
          parts: [{ type: 'text', text: 'private instructions' }],
        },
        { id: 'empty', role: 'assistant', parts: [{ type: 'text', text: '' }] },
        {
          id: 'bad',
          role: 'assistant',
          parts: [
            {
              type: 'tool-change-address',
              toolCallId: 'call',
              state: 'output-available',
              input: {},
              output: { ...proposal, secret: 'unexpected' },
            },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it('streams text and safe transient activity without tool, provider, reasoning or arbitrary data', async () => {
    const output = await project([
      {
        type: 'start',
        messageId: 'private-model-id',
        messageMetadata: { secret: true },
      },
      { type: 'reasoning-start', id: 'private' },
      { type: 'reasoning-delta', id: 'private', delta: 'private reasoning' },
      {
        type: 'tool-input-start',
        toolName: 'find-order',
        toolCallId: 'private-call',
      },
      {
        type: 'tool-input-delta',
        toolCallId: 'private-call',
        inputTextDelta: 'private input',
      },
      {
        type: 'tool-input-available',
        toolName: 'find-order',
        toolCallId: 'private-call',
        input: { orderId: 'ord_123' },
      },
      {
        type: 'tool-output-available',
        toolCallId: 'private-call',
        output: { deliveryAddress: 'private address' },
      },
      {
        type: 'source-url',
        sourceId: 'private',
        url: 'https://private.invalid',
      },
      { type: 'data-secret', data: 'private data' },
      {
        type: 'text-start',
        id: 'text',
        providerMetadata: { private: { secret: true } },
      },
      { type: 'text-delta', id: 'text', delta: 'Your order arrived.' },
      {
        type: 'text-end',
        id: 'text',
        providerMetadata: { private: { secret: true } },
      },
      { type: 'finish', messageMetadata: { secret: true } },
    ]);
    expect(output.filter((chunk) => chunk.type === 'data-activity')).toEqual([
      {
        type: 'data-activity',
        data: { activity: 'thinking' },
        transient: true,
      },
      {
        type: 'data-activity',
        data: { activity: 'finding-order' },
        transient: true,
      },
      {
        type: 'data-activity',
        data: { activity: 'thinking' },
        transient: true,
      },
      {
        type: 'data-activity',
        data: { activity: 'responding' },
        transient: true,
      },
    ]);
    expect(output[0]).toEqual({ type: 'start', messageId: 'server-message' });
    expect(JSON.stringify(output)).not.toMatch(
      /private|ord_123|toolCallId|toolName|providerMetadata|messageMetadata|reasoning/,
    );
    let message: UIMessage | undefined;
    for await (const snapshot of readUIMessageStream({
      stream: new ReadableStream({
        start(controller) {
          output.forEach((chunk) => controller.enqueue(chunk));
          controller.close();
        },
      }),
    }))
      message = snapshot;
    expect(message).toEqual({
      id: 'server-message',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Your order arrived.', state: 'done' }],
    });
  });

  it.each([
    ['search-products', 'searching-products'],
    ['change-address', 'preparing-address-change'],
    ['unknown-private-tool', 'checking-details'],
  ])('maps %s to a fixed public activity', async (toolName, activity) => {
    const output = await project([
      {
        type: 'tool-input-available',
        toolCallId: 'private-call',
        toolName,
        input: { secret: true },
      },
    ]);
    expect(output.at(-1)).toEqual({
      type: 'data-activity',
      data: { activity },
      transient: true,
    });
    expect(JSON.stringify(output)).not.toContain(toolName);
  });

  it('keeps the current activity while another parallel operation is pending', async () => {
    const output = await project([
      {
        type: 'tool-input-available',
        toolCallId: 'one',
        toolName: 'find-order',
        input: {},
      },
      {
        type: 'tool-input-available',
        toolCallId: 'two',
        toolName: 'search-products',
        input: {},
      },
      { type: 'tool-output-available', toolCallId: 'one', output: {} },
      {
        type: 'tool-output-error',
        toolCallId: 'two',
        errorText: 'private error',
      },
    ]);
    expect(
      output.flatMap((chunk) =>
        chunk.type === 'data-activity' ? [chunk.data] : [],
      ),
    ).toEqual([
      { activity: 'thinking' },
      { activity: 'finding-order' },
      { activity: 'searching-products' },
      { activity: 'thinking' },
    ]);
    expect(JSON.stringify(output)).not.toContain('private');
  });

  it('publishes an approval only for a completed address-proposal operation', async () => {
    const output = await project([
      {
        type: 'tool-output-available',
        toolCallId: 'unknown',
        output: proposal,
      },
      {
        type: 'tool-input-available',
        toolCallId: 'find',
        toolName: 'find-order',
        input: {},
      },
      { type: 'tool-output-available', toolCallId: 'find', output: proposal },
      {
        type: 'tool-input-available',
        toolCallId: 'proposal',
        toolName: 'change-address',
        input: {},
      },
      {
        type: 'tool-output-available',
        toolCallId: 'proposal',
        output: proposal,
        preliminary: true,
      },
      {
        type: 'tool-output-available',
        toolCallId: 'proposal',
        output: proposal,
      },
    ]);
    expect(
      output.filter((chunk) => chunk.type === 'data-address-approval'),
    ).toEqual([
      {
        type: 'data-address-approval',
        id: proposal.confirmationId,
        data: approval,
      },
    ]);
  });

  it('hides errors, abort reasons and unknown future events', async () => {
    const output = await project([
      { type: 'error', errorText: 'private exception' },
      { type: 'abort', reason: 'private abort' },
      {
        type: 'future-internal-event',
        secret: 'private',
      } as unknown as UIMessageChunk,
    ]);
    expect(output).toContainEqual({ type: 'abort' });
    expect(output).toContainEqual({
      type: 'error',
      errorText: expect.stringContaining('Reload history'),
    });
    expect(JSON.stringify(output)).not.toMatch(/private|future/);
  });
});
