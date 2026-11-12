import type { UIMessage } from 'ai';
import { chatRequestSchema } from '@cat-supplies-store/contracts';

export function prepareChatRequest(messages: UIMessage[]) {
  const message = messages.at(-1);
  if (message?.role !== 'user')
    throw new Error('A new user message is required.');
  return chatRequestSchema.parse({
    requestId: message.id,
    text: message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join(''),
  });
}
export interface ConversationHistory {
  id: string;
  messages: UIMessage[];
  active: boolean;
  approvals: { confirmationId: string; status: string }[];
  turns: { id: string; requestId: string; status: string; sequence: number }[];
}
