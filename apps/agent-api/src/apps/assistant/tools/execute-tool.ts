import { UnauthorizedException } from '@nestjs/common';
import type { AgentFunctionContext } from '@nestjs/ai';
import type { CustomerRequest } from '../../../integrations/business-api/business-api.client';

export function executeTool<T>(
  context: AgentFunctionContext,
  input: unknown,
  operation: () => Promise<T>,
) {
  const request = context.request as CustomerRequest | undefined;
  if (!request?.execution)
    throw new UnauthorizedException('A server-owned turn is required.');
  context.signal.throwIfAborted();
  return request.execution.runTool(
    context.toolCallId,
    context.name,
    input,
    operation,
  );
}
