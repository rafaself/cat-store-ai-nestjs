import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AssistantService } from './assistant.service';
import { randomUUID } from 'node:crypto';
import { createUIMessageStreamResponse } from 'ai';
import { publicChatStream } from './chat-presentation';

export const CHAT_STREAM_LIMITS = {
  perCustomer: 1,
  perProcess: 20,
  lifetimeMs: 120_000,
} as const;
type Generation = ReturnType<AssistantService['stream']>;
type Result = Awaited<Generation['result']>;

/** Generation owns its lifetime. An HTTP reader may detach without cancelling it. */
@Injectable()
export class ChatStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatStreamService.name);
  private readonly customers = new Set<string>();
  private readonly active = new Map<AbortController, Promise<void>>();
  private stopping = false;

  open(
    customerId: string,
    start: (signal: AbortSignal) => Generation,
    settle: (
      result: Result | undefined,
      error: unknown,
    ) => Promise<void> = async () => {},
    messageId: string = randomUUID(),
  ) {
    if (this.stopping || this.active.size >= CHAT_STREAM_LIMITS.perProcess)
      throw new ServiceUnavailableException('Chat capacity is unavailable.');
    if (this.customers.has(customerId))
      throw new HttpException(
        'A chat response is already active for this customer.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const abort = new AbortController();
    const generation = start(abort.signal);
    this.customers.add(customerId);
    let attached = true;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>(
      {
        start(value) {
          controller = value;
        },
        cancel() {
          attached = false;
        },
      },
      { highWaterMark: 256 * 1024, size: (chunk) => chunk.byteLength },
    );
    const timer = setTimeout(
      () =>
        abort.abort(
          new DOMException('Chat deadline exceeded.', 'TimeoutError'),
        ),
      CHAT_STREAM_LIMITS.lifetimeMs,
    );
    timer.unref();
    // Drain independently of the client. A slow reader is detached at 256 KiB.
    const delivery = (async () => {
      try {
        const source = createUIMessageStreamResponse({
          stream: publicChatStream(generation.toUIMessageStream(), messageId),
          keepAliveMs: 15_000,
        });
        const reader = source.body!.getReader();
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            if (
              attached &&
              (controller!.desiredSize ?? 0) < chunk.value.byteLength
            ) {
              attached = false;
              controller!.error(
                new Error(
                  'Reload conversation history to recover this response.',
                ),
              );
            }
            if (attached) controller!.enqueue(chunk.value);
          }
        } finally {
          reader.releaseLock();
        }
      } catch {
        abort.abort(new Error('Stream source failed.'));
      }
    })();
    const completion = (async () => {
      let result: Result | undefined;
      let failure: unknown;
      try {
        result = await generation.result;
      } catch (error) {
        failure = error;
      }
      try {
        await delivery;
        await settle(result, failure);
        if (attached) controller!.close();
      } catch (error) {
        this.logger.error('Failed to persist a conversation turn.', error);
        if (attached)
          controller!.error(
            new Error(
              'Unable to save the response. Reload history before retrying.',
            ),
          );
      } finally {
        clearTimeout(timer);
        this.customers.delete(customerId);
        this.active.delete(abort);
      }
    })();
    this.active.set(abort, completion);
    return new Response(body, {
      headers: {
        'content-type': 'text/event-stream',
        'x-vercel-ai-ui-message-stream': 'v1',
        'cache-control': 'no-cache',
      },
    });
  }

  async onModuleDestroy() {
    this.stopping = true;
    for (const abort of this.active.keys())
      abort.abort(new DOMException('Server shutting down.', 'AbortError'));
    await Promise.all(this.active.values());
  }
}
