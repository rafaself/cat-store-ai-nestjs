import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ChatRequest } from '@cat-supplies-store/contracts';
import {
  addressChangeProposalSchema,
  conversationHistorySchema,
} from '@cat-supplies-store/contracts';
import type { UIMessage } from 'ai';
import {
  BusinessApiClient,
  type CustomerRequest,
} from '../../integrations/business-api/business-api.client';
import { AssistantService } from './assistant.service';
import { ChatStreamService } from './chat-stream.service';
import { ConversationRepository } from './conversation.repository';
import { modelContext, toolParts, turnUI } from './conversation-history';
import { publicMessages } from './chat-presentation';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private activeApprovals = 0;

  constructor(
    private readonly repository: ConversationRepository,
    private readonly assistant: AssistantService,
    private readonly streams: ChatStreamService,
    private readonly business: BusinessApiClient,
  ) {}

  private customer(request: CustomerRequest) {
    if (!request.customerId) throw new UnauthorizedException();
    return request.customerId;
  }
  create(request: CustomerRequest) {
    return this.repository.create(this.customer(request));
  }
  list(request: CustomerRequest) {
    return this.repository.list(this.customer(request));
  }

  async history(id: string, request: CustomerRequest) {
    // Recover abandoned turns only when no instance is executing this conversation.
    try {
      const session = await this.repository.acquire(id, this.customer(request));
      await session.release();
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
    }
    const { turns, tools, approvals } = await this.repository.snapshot(
      id,
      this.customer(request),
    );
    return conversationHistorySchema.parse({
      id,
      messages: publicMessages(
        turns.flatMap((turn) =>
          turnUI(
            turn,
            tools.filter((tool) => tool.turn_id === turn.id),
          ),
        ),
      ),
      turns: turns.map((turn) => ({
        id: turn.id,
        requestId: turn.request_id,
        status: turn.status,
        sequence: turn.sequence,
      })),
      approvals,
      active: turns.some((turn) => turn.status === 'running'),
    });
  }

  async send(
    id: string,
    input: ChatRequest,
    request: CustomerRequest,
  ): Promise<Response> {
    const session = await this.repository.acquire(id, this.customer(request));
    let handedOff = false;
    let turnId: string | undefined;
    let failure: unknown;
    try {
      const { turn, duplicate, history } = await this.repository.begin(
        session,
        input.requestId,
        input.text,
        'message',
      );
      if (duplicate)
        return Response.json({
          turnId: turn.id,
          status: turn.status,
          replayed: true,
        });
      turnId = turn.id;
      const tools = await this.repository.tools(id, session.runner);
      const context = modelContext(history, tools);
      context.push({ role: 'user', content: input.text });
      if (JSON.stringify(context).length > 100_000)
        throw new PayloadTooLargeException(
          'Conversation is full. Start a new conversation.',
        );
      const pendingTools = new Set<Promise<unknown>>();
      let executionClosed = false;
      const caller: CustomerRequest = {
        customerId: request.customerId,
        headers: { authorization: request.headers.authorization },
        execution: {
          runTool: (callId, name, args, operation) => {
            if (executionClosed)
              throw new ConflictException('Turn execution has finished.');
            const pending = this.repository.executeTool(
              session,
              turn.id,
              callId,
              name,
              args,
              operation,
            );
            pendingTools.add(pending);
            void pending.then(
              () => pendingTools.delete(pending),
              () => pendingTools.delete(pending),
            );
            return pending;
          },
        },
      };
      const response = this.streams.open(
        this.customer(request),
        (signal) =>
          this.assistant.stream(
            context,
            caller,
            AbortSignal.any([signal, session.signal]),
          ),
        async (result, error) => {
          executionClosed = true;
          // Providers may acknowledge abort before an already-started tool settles.
          // Keep the database lock and journal alive until every operation settles.
          await Promise.allSettled(pendingTools);
          try {
            const completedTools = (
              await this.repository.tools(id, session.runner)
            ).filter((tool) => tool.turn_id === turn.id);
            const text =
              result?.text ||
              (error
                ? 'The response was interrupted. Check the status of any requested changes before retrying.'
                : '');
            const ui: UIMessage = {
              id: turn.id,
              role: 'assistant',
              parts: [
                ...toolParts(completedTools),
                ...(text ? [{ type: 'text' as const, text }] : []),
              ],
            };
            await this.repository.finish(
              session,
              turn.id,
              result ? 'completed' : 'failed',
              result?.responseMessages ?? [],
              ui,
            );
          } finally {
            await session.release();
          }
        },
        turn.id,
      );
      handedOff = true;
      return response;
    } catch (error) {
      failure = error;
      if (turnId) {
        try {
          await this.repository.finish(session, turnId, 'failed', [], {
            id: turnId,
            role: 'assistant',
            parts: [
              { type: 'text', text: 'The response could not be started.' },
            ],
          });
        } catch (saveError) {
          this.logger.error('Failed to record a rejected turn.', saveError);
        }
      }
      throw error;
    } finally {
      if (!handedOff) await session.release(failure);
    }
  }

  async approve(
    id: string,
    confirmationId: string,
    requestId: string,
    request: CustomerRequest,
  ) {
    if (this.activeApprovals >= 5)
      throw new ServiceUnavailableException(
        'Approval capacity is unavailable.',
      );
    this.activeApprovals++;
    try {
      return await this.applyApproval(id, confirmationId, requestId, request);
    } finally {
      this.activeApprovals--;
    }
  }

  private async applyApproval(
    id: string,
    confirmationId: string,
    requestId: string,
    request: CustomerRequest,
  ) {
    const session = await this.repository.acquire(id, this.customer(request));
    let turnId: string | undefined;
    let failure: unknown;
    try {
      const approval = await this.repository.approval(session, confirmationId);
      const proposal = addressChangeProposalSchema.parse(approval.proposal);
      const text = `Apply approved address change ${confirmationId}.`;
      const previous = await this.repository.previous(
        session,
        requestId,
        text,
        'approval',
      );
      if (previous)
        return { turnId: previous.id, status: previous.status, replayed: true };
      if (
        approval.status !== 'pending' ||
        Date.parse(proposal.expiresAt) <= Date.now()
      )
        throw new ForbiddenException('Proposal is unavailable or expired.');
      const { turn } = await this.repository.begin(
        session,
        requestId,
        text,
        'approval',
      );
      turnId = turn.id;
      await this.repository.startApproval(session, confirmationId, turn.id);
      await this.repository.executeTool(
        session,
        turn.id,
        `approve-${confirmationId}`,
        'approve-address',
        { confirmationId },
        () =>
          this.business.approveAddressChange(
            confirmationId,
            proposal.orderId,
            proposal.address,
            request,
            session.signal,
          ),
      );
      const order = await this.repository.executeTool(
        session,
        turn.id,
        `apply-${confirmationId}`,
        'apply-address',
        proposal,
        () =>
          this.business.changeAddress(
            proposal.orderId,
            proposal.address,
            confirmationId,
            request,
            session.signal,
          ),
      );
      const textResult = `Delivery address for order ${order.id} changed to ${order.deliveryAddress}.`;
      await this.repository.finishApproval(
        session,
        turn.id,
        confirmationId,
        'completed',
        [{ role: 'assistant', content: textResult }],
        {
          id: turn.id,
          role: 'assistant',
          parts: [{ type: 'text', text: textResult }],
        },
      );
      return { turnId: turn.id, status: 'completed' };
    } catch (error) {
      failure = error;
      if (turnId) {
        try {
          await this.repository.finishApproval(
            session,
            turnId,
            confirmationId,
            'failed',
            [],
            {
              id: turnId,
              role: 'assistant',
              parts: [
                {
                  type: 'text',
                  text: 'Unable to confirm the operation outcome. Check the order before trying again.',
                },
              ],
            },
          );
        } catch (saveError) {
          this.logger.error(
            'Failed to finalize an approval after an error.',
            saveError,
          );
        }
      }
      throw error;
    } finally {
      await session.release(failure);
    }
  }
}
