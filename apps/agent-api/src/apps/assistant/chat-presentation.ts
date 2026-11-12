import {
  addressChangeProposalSchema,
  type AddressApproval,
  type ChatActivity,
  type PublicChatMessage,
} from '@cat-supplies-store/contracts';
import type { UIMessage, UIMessageChunk } from 'ai';

function addressApproval(output: unknown): AddressApproval | undefined {
  const proposal = addressChangeProposalSchema.safeParse(output);
  if (!proposal.success) return;
  const { confirmationId, orderId, address, expiresAt } = proposal.data;
  return { confirmationId, orderId, address, expiresAt };
}

/** Apply to saved snapshots too: older turns may contain raw tool data. */
export function publicMessages(messages: UIMessage[]): PublicChatMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== 'user' && message.role !== 'assistant') return [];
    const parts: PublicChatMessage['parts'] = [];
    for (const part of message.parts) {
      if (part.type === 'text' && part.text) {
        parts.push({ type: 'text', text: part.text });
      } else if (
        message.role === 'assistant' &&
        part.type === 'tool-change-address' &&
        part.state === 'output-available'
      ) {
        const data = addressApproval(part.output);
        if (data)
          parts.push({
            type: 'data-address-approval',
            id: data.confirmationId,
            data,
          });
      }
    }
    return parts.length ? [{ id: message.id, role: message.role, parts }] : [];
  });
}

function toolActivity(name: string): ChatActivity['activity'] {
  switch (name) {
    case 'find-order':
      return 'finding-order';
    case 'search-products':
      return 'searching-products';
    case 'change-address':
      return 'preparing-address-change';
    default:
      return 'checking-details';
  }
}

/** Explicit allowlist: new SDK events remain internal until reviewed. */
export function publicChatStream(
  source: ReadableStream<UIMessageChunk>,
  messageId: string,
): ReadableStream<UIMessageChunk> {
  const tools = new Map<string, string>();
  let previousActivity: ChatActivity['activity'] | undefined;
  function activity(
    value: ChatActivity['activity'],
    controller: TransformStreamDefaultController<UIMessageChunk>,
  ) {
    if (previousActivity === value) return;
    previousActivity = value;
    controller.enqueue({
      type: 'data-activity',
      data: { activity: value },
      transient: true,
    });
  }

  return source.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start', messageId });
        activity('thinking', controller);
      },
      transform(chunk, controller) {
        switch (chunk.type) {
          case 'text-start':
          case 'text-end':
            controller.enqueue({ type: chunk.type, id: chunk.id });
            break;
          case 'text-delta':
            activity('responding', controller);
            controller.enqueue({
              type: 'text-delta',
              id: chunk.id,
              delta: chunk.delta,
            });
            break;
          case 'tool-input-available':
            tools.set(chunk.toolCallId, chunk.toolName);
            activity(toolActivity(chunk.toolName), controller);
            break;
          case 'tool-output-available': {
            if (chunk.preliminary) break;
            if (tools.get(chunk.toolCallId) === 'change-address') {
              const data = addressApproval(chunk.output);
              if (data)
                controller.enqueue({
                  type: 'data-address-approval',
                  id: data.confirmationId,
                  data,
                });
            }
            tools.delete(chunk.toolCallId);
            const pending = [...tools.values()].at(-1);
            activity(pending ? toolActivity(pending) : 'thinking', controller);
            break;
          }
          case 'tool-output-error':
          case 'tool-output-denied': {
            tools.delete(chunk.toolCallId);
            const pending = [...tools.values()].at(-1);
            activity(pending ? toolActivity(pending) : 'thinking', controller);
            break;
          }
          case 'error':
            controller.enqueue({
              type: 'error',
              errorText:
                'Unable to complete the response. Reload history before retrying.',
            });
            break;
          case 'finish':
            controller.enqueue({ type: 'finish' });
            break;
          case 'abort':
            controller.enqueue({ type: 'abort' });
            break;
        }
      },
    }),
  );
}
