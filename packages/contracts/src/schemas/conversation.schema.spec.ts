import { describe, expect, it } from 'vitest';
import {
  chatActivityLabels,
  chatActivitySchema,
  publicChatMessageSchema,
} from './conversation.schema.js';

describe('public conversation contract', () => {
  it('accepts only known activity codes with user-facing labels', () => {
    for (const activity of Object.keys(chatActivityLabels)) {
      expect(chatActivitySchema.parse({ activity })).toEqual({ activity });
      expect(
        chatActivityLabels[activity as keyof typeof chatActivityLabels],
      ).toMatch(/…$/);
    }
    expect(
      chatActivitySchema.safeParse({ activity: 'private-tool' }).success,
    ).toBe(false);
    expect(
      chatActivitySchema.safeParse({
        activity: 'thinking',
        input: { secret: true },
      }).success,
    ).toBe(false);
  });

  it('rejects raw tool parts, reasoning and unexpected message metadata', () => {
    const message = {
      id: 'message',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello' }],
    };
    expect(publicChatMessageSchema.safeParse(message).success).toBe(true);
    expect(
      publicChatMessageSchema.safeParse({
        ...message,
        metadata: { secret: true },
      }).success,
    ).toBe(false);
    for (const part of [
      { type: 'tool-find-order', output: { secret: true } },
      { type: 'reasoning', text: 'private' },
      { type: 'text', text: 'Hello', providerMetadata: { secret: true } },
      { type: 'data-activity', data: { activity: 'thinking' } },
    ])
      expect(
        publicChatMessageSchema.safeParse({ ...message, parts: [part] })
          .success,
      ).toBe(false);
  });
});
