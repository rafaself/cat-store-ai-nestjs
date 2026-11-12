import type { UIMessage } from 'ai';

export function prepareChatRequest(messages: UIMessage[]) {
  return {
    messages: messages
      .map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts.filter(
          (part) => part.type === 'text' && part.state !== 'streaming',
        ),
      }))
      .filter((message) =>
        message.parts.some((part) => part.type === 'text' && part.text.trim()),
      ),
  };
}
