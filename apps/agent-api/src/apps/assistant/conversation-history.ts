import type { JSONValue, ModelMessage, UIMessage } from 'ai';
import type {
  ConversationTurn,
  ToolExecution,
} from './conversation.repository';

export function toolParts(tools: ToolExecution[]): UIMessage['parts'] {
  return tools.map((tool) => ({
    type: `tool-${tool.name}` as const,
    toolCallId: tool.tool_call_id,
    input: tool.input,
    ...(tool.status === 'completed'
      ? { state: 'output-available' as const, output: tool.output }
      : {
          state: 'output-error' as const,
          errorText:
            tool.status === 'running'
              ? 'Operation is still running.'
              : 'Operation outcome is unavailable. Check current state before trying again.',
        }),
  }));
}
export function turnUI(
  turn: ConversationTurn,
  tools: ToolExecution[],
): UIMessage[] {
  const user: UIMessage = {
    id: turn.request_id,
    role: 'user',
    parts: [{ type: 'text', text: turn.input }],
  };
  if (turn.ui_message) return [user, turn.ui_message];
  const parts = toolParts(tools);
  if (turn.status !== 'running')
    parts.push({
      type: 'text',
      text: 'The response was interrupted. Completed operations are shown above; check their current state before retrying.',
    });
  return parts.length
    ? [user, { id: turn.id, role: 'assistant', parts }]
    : [user];
}
export function modelContext(
  turns: ConversationTurn[],
  tools: ToolExecution[],
): ModelMessage[] {
  return turns.flatMap((turn): ModelMessage[] => {
    const messages: ModelMessage[] = [{ role: 'user', content: turn.input }];
    if (turn.status === 'completed')
      return [...messages, ...turn.model_messages];
    // Interrupted turns may have completed a side effect before the model failed.
    // Reconstruct only actual server operations; never fabricate their success.
    for (const tool of tools.filter((tool) => tool.turn_id === turn.id)) {
      messages.push({
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: tool.tool_call_id,
            toolName: tool.name,
            input: tool.input,
          },
        ],
      });
      messages.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: tool.tool_call_id,
            toolName: tool.name,
            output:
              tool.status === 'completed'
                ? { type: 'json', value: tool.output as JSONValue }
                : {
                    type: 'error-text',
                    value:
                      'Outcome unknown. Recheck current state; do not assume the operation failed or repeat it.',
                  },
          },
        ],
      });
    }
    return messages;
  });
}
