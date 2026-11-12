import type { UIMessage } from 'ai';
import {
  chatRequestSchema,
  type ChatActivity,
  type AddressApproval,
} from '@cat-supplies-store/contracts';
export type { ConversationHistory } from '@cat-supplies-store/contracts';
export type ChatUIMessage = UIMessage<
  unknown,
  {
    activity: ChatActivity;
    'address-approval': AddressApproval;
  }
>;

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
