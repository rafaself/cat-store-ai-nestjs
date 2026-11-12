import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AssistantService } from './assistant.service';

export const CHAT_STREAM_LIMITS = {
  perCustomer: 1,
  perProcess: 20,
  lifetimeMs: 120_000,
} as const;

type Generation = ReturnType<AssistantService['stream']>;

/** Admission and lifetime of a chat, including delivery to a slow client. */
@Injectable()
export class ChatStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatStreamService.name);
  private readonly customers = new Map<string, number>();
  private readonly active = new Set<AbortController>();
  private stopping = false;

  open(
    customerId: string,
    start: (signal: AbortSignal) => Generation,
  ): Response {
    if (this.stopping || this.active.size >= CHAT_STREAM_LIMITS.perProcess) {
      throw new ServiceUnavailableException('Chat capacity is unavailable.');
    }
    const count = this.customers.get(customerId) ?? 0;
    if (count >= CHAT_STREAM_LIMITS.perCustomer) {
      throw new HttpException(
        'A chat response is already active for this customer.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const abort = new AbortController();
    this.active.add(abort);
    this.customers.set(customerId, count + 1);
    let generationStarted = false;
    let generationDone = false;
    let deliveryDone = false;
    let released = false;
    let timer: NodeJS.Timeout | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const release = () => {
      if (released || !generationDone || !deliveryDone) return;
      released = true;
      clearTimeout(timer);
      abort.signal.removeEventListener('abort', onAbort);
      this.active.delete(abort);
      const remaining = (this.customers.get(customerId) ?? 1) - 1;
      if (remaining === 0) this.customers.delete(customerId);
      else this.customers.set(customerId, remaining);
    };
    const cancelReader = () => {
      const current = reader;
      reader = undefined;
      void current
        ?.cancel(abort.signal.reason)
        .catch(() => {
          this.logger.warn('Failed to cancel a chat response body.');
        })
        .finally(() => current.releaseLock());
    };
    let bodyController: ReadableStreamDefaultController<Uint8Array>;
    const onAbort = () => {
      deliveryDone = true;
      bodyController?.error(abort.signal.reason);
      cancelReader();
      release();
    };

    try {
      const generation = start(abort.signal);
      generationStarted = true;
      // Handle rejection here; the UI stream communicates a sanitized error.
      void generation.result.then(
        () => {
          generationDone = true;
          release();
        },
        () => {
          generationDone = true;
          release();
        },
      );
      const response = generation.toUIMessageStreamResponse({
        errorText: () => 'An error occurred while generating a response.',
      });
      reader = response.body!.getReader();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          bodyController = controller;
        },
        async pull(controller) {
          const current = reader;
          if (!current) return;
          try {
            const next = await current.read();
            if (abort.signal.aborted) return;
            if (next.done) {
              current.releaseLock();
              reader = undefined;
              deliveryDone = true;
              controller.close();
              release();
            } else {
              controller.enqueue(next.value);
            }
          } catch (error) {
            if (abort.signal.aborted) return;
            // A failed source is already terminal; cancelling it would just
            // reject again with the same error. Release its reader instead.
            current.releaseLock();
            reader = undefined;
            deliveryDone = true;
            controller.error(error);
            abort.abort(error);
            release();
          }
        },
        cancel(reason) {
          deliveryDone = true;
          abort.abort(reason);
          release();
        },
      });
      abort.signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => {
        abort.abort(
          new DOMException('Chat deadline exceeded.', 'TimeoutError'),
        );
      }, CHAT_STREAM_LIMITS.lifetimeMs);
      timer.unref();
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      deliveryDone = true;
      // If start threw, no generation exists. If response construction threw,
      // the registered completion handler still holds capacity until it settles.
      if (!generationStarted) generationDone = true;
      abort.abort(error);
      cancelReader();
      release();
      throw error;
    }
  }

  onModuleDestroy() {
    this.stopping = true;
    for (const controller of this.active) {
      controller.abort(new DOMException('Server shutting down.', 'AbortError'));
    }
  }
}
