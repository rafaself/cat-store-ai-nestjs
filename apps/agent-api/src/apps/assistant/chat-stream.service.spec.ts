import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistantService } from './assistant.service';
import { CHAT_STREAM_LIMITS, ChatStreamService } from './chat-stream.service';

type Generation = ReturnType<AssistantService['stream']>;
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const completion = deferred();
  const cancel = vi.fn();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let signal!: AbortSignal;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
      cancel,
    }),
    {
      headers: {
        'content-type': 'text/event-stream',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
    },
  );
  const start = vi.fn((value: AbortSignal) => {
    signal = value;
    return {
      result: completion.promise,
      toUIMessageStreamResponse: vi.fn(() => response),
    } as unknown as Generation;
  });
  return {
    completion,
    cancel,
    controller,
    start,
    get signal() {
      return signal;
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('ChatStreamService', () => {
  it('keeps capacity after generation finishes until the client consumes the body', async () => {
    const service = new ChatStreamService();
    const run = fixture();
    const response = service.open('one', run.start);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');
    run.completion.resolve();
    await run.completion.promise;
    expect(() => service.open('one', fixture().start)).toThrow(
      'already active',
    );
    run.controller.enqueue(new TextEncoder().encode('data: hello\n\n'));
    run.controller.close();
    expect(await response.text()).toBe('data: hello\n\n');
    const next = fixture();
    const nextResponse = service.open('one', next.start);
    await nextResponse.body!.cancel();
    next.completion.resolve();
  });

  it('aborts on disconnect but holds the slot until generation settles', async () => {
    const service = new ChatStreamService();
    const run = fixture();
    const response = service.open('one', run.start);
    await response.body!.cancel();
    expect(run.signal.aborted).toBe(true);
    expect(run.cancel).toHaveBeenCalledTimes(1);
    expect(() => service.open('one', fixture().start)).toThrow(
      'already active',
    );
    run.completion.reject(new Error('aborted'));
    await Promise.resolve();
    const next = fixture();
    await service.open('one', next.start).body!.cancel();
    next.completion.resolve();
  });

  it('enforces the deadline even after generation finishes for a stalled client', async () => {
    vi.useFakeTimers();
    const service = new ChatStreamService();
    const run = fixture();
    const response = service.open('one', run.start);
    run.completion.resolve();
    await run.completion.promise;
    await vi.advanceTimersByTimeAsync(CHAT_STREAM_LIMITS.lifetimeMs);
    expect(run.signal.aborted).toBe(true);
    expect(run.cancel).toHaveBeenCalledTimes(1);
    await expect(response.text()).rejects.toThrow('Chat deadline exceeded');
    const next = fixture();
    await service.open('one', next.start).body!.cancel();
    next.completion.resolve();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects excess process capacity before starting generation and drains on shutdown', async () => {
    const service = new ChatStreamService();
    const runs = Array.from({ length: CHAT_STREAM_LIMITS.perProcess }, () =>
      fixture(),
    );
    const responses = runs.map((run, i) => service.open(String(i), run.start));
    const excess = fixture();
    expect(() => service.open('excess', excess.start)).toThrow('capacity');
    expect(excess.start).not.toHaveBeenCalled();
    service.onModuleDestroy();
    for (const [i, run] of runs.entries()) {
      expect(run.signal.aborted).toBe(true);
      await expect(responses[i]!.text()).rejects.toThrow(
        'Server shutting down',
      );
      run.completion.resolve();
    }
    expect(() => service.open('new', excess.start)).toThrow('capacity');
  });

  it('releases capacity when generation setup throws', async () => {
    const service = new ChatStreamService();
    expect(() =>
      service.open('one', () => {
        throw new Error('setup');
      }),
    ).toThrow('setup');
    const next = fixture();
    await service.open('one', next.start).body!.cancel();
    next.completion.resolve();
  });
});

describe('Chat lifecycle failure cleanup', () => {
  it('times out pending generation and holds capacity until it acknowledges abort', async () => {
    vi.useFakeTimers();
    const service = new ChatStreamService();
    const run = fixture();
    const response = service.open('one', run.start);
    await vi.advanceTimersByTimeAsync(CHAT_STREAM_LIMITS.lifetimeMs);
    await expect(response.text()).rejects.toThrow('Chat deadline exceeded');
    expect(run.signal.aborted).toBe(true);
    expect(() => service.open('one', fixture().start)).toThrow(
      'already active',
    );
    run.completion.reject(new Error('generation stopped'));
    await Promise.resolve();
    const next = fixture();
    await service.open('one', next.start).body!.cancel();
    next.completion.resolve();
  });

  it('aborts generation if the response source fails', async () => {
    const service = new ChatStreamService();
    const run = fixture();
    const response = service.open('one', run.start);
    run.controller.error(new Error('source failed'));
    await expect(response.text()).rejects.toThrow('source failed');
    expect(run.signal.aborted).toBe(true);
    run.completion.reject(new Error('generation stopped'));
    await Promise.resolve();
    const next = fixture();
    await service.open('one', next.start).body!.cancel();
    next.completion.resolve();
  });

  it('aborts generation if response construction fails and waits for settlement', async () => {
    const service = new ChatStreamService();
    const completion = deferred();
    let signal!: AbortSignal;
    expect(() =>
      service.open('one', (value) => {
        signal = value;
        return {
          result: completion.promise,
          toUIMessageStreamResponse() {
            throw new Error('response failed');
          },
        } as unknown as Generation;
      }),
    ).toThrow('response failed');
    expect(signal.aborted).toBe(true);
    expect(() => service.open('one', fixture().start)).toThrow(
      'already active',
    );
    completion.reject(new Error('generation stopped'));
    await Promise.resolve();
    const next = fixture();
    await service.open('one', next.start).body!.cancel();
    next.completion.resolve();
  });
});
