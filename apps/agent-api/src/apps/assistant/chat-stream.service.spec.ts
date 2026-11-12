import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistantService } from './assistant.service';
import { CHAT_STREAM_LIMITS, ChatStreamService } from './chat-stream.service';
type Generation = ReturnType<AssistantService['stream']>;
function fixture() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const result = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let signal!: AbortSignal;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    cancel,
  });
  const start = (value: AbortSignal) => {
    signal = value;
    return {
      result,
      toUIMessageStreamResponse: () => new Response(body),
    } as unknown as Generation;
  };
  return {
    start,
    cancel,
    controller,
    resolve,
    reject,
    result,
    get signal() {
      return signal;
    },
  };
}
afterEach(() => vi.useRealTimers());
describe('detached chat execution lifecycle', () => {
  it('continues generation and persists after a disconnected client', async () => {
    const service = new ChatStreamService();
    const run = fixture();
    const settle = vi.fn(async () => {});
    const response = service.open('one', run.start, settle);
    await response.body!.cancel();
    expect(run.signal.aborted).toBe(false);
    expect(run.cancel).not.toHaveBeenCalled();
    expect(() => service.open('one', fixture().start)).toThrow(
      'already active',
    );
    run.controller.enqueue(new TextEncoder().encode('data: reply\n\n'));
    run.controller.close();
    run.resolve();
    await vi.waitFor(() => expect(settle).toHaveBeenCalledTimes(1));
    await service.onModuleDestroy();
  });
  it('waits for persistence before closing the response', async () => {
    const service = new ChatStreamService();
    const run = fixture();
    let saved!: () => void;
    const persistence = new Promise<void>((resolve) => {
      saved = resolve;
    });
    const response = service.open('one', run.start, () => persistence);
    const read = vi.fn();
    const pending = response.text().then(read);
    run.controller.close();
    run.resolve();
    await run.result;
    expect(read).not.toHaveBeenCalled();
    saved();
    await pending;
    expect(read).toHaveBeenCalled();
  });
  it('detaches a slow reader without aborting work or buffering indefinitely', async () => {
    const service = new ChatStreamService();
    const run = fixture();
    const response = service.open('one', run.start);
    run.controller.enqueue(new Uint8Array(300_000));
    await expect(response.text()).rejects.toThrow('Reload');
    expect(run.signal.aborted).toBe(false);
    run.controller.close();
    run.resolve();
    await service.onModuleDestroy();
  });
  it('enforces the execution deadline independently of connection cancellation', async () => {
    vi.useFakeTimers();
    const service = new ChatStreamService();
    const run = fixture();
    const settle = vi.fn(async () => {});
    await service.open('one', run.start, settle).body!.cancel();
    await vi.advanceTimersByTimeAsync(CHAT_STREAM_LIMITS.lifetimeMs);
    expect(run.signal.aborted).toBe(true);
    run.controller.close();
    run.reject(new Error('aborted'));
    await service.onModuleDestroy();
    expect(settle).toHaveBeenCalledWith(undefined, expect.any(Error));
  });
  it('aborts and waits for active generations on shutdown', async () => {
    const service = new ChatStreamService();
    const run = fixture();
    await service.open('one', run.start).body!.cancel();
    const stopped = service.onModuleDestroy();
    expect(run.signal.aborted).toBe(true);
    expect(() => service.open('two', fixture().start)).toThrow('capacity');
    run.controller.close();
    run.reject(new Error('shutdown'));
    await stopped;
  });
  it('keeps capacity limits and does not reserve a slot if startup throws', async () => {
    const service = new ChatStreamService();
    expect(() =>
      service.open('one', () => {
        throw new Error('setup');
      }),
    ).toThrow('setup');
    const runs = Array.from({ length: CHAT_STREAM_LIMITS.perProcess }, () =>
      fixture(),
    );
    for (const [index, run] of runs.entries())
      await service.open(String(index), run.start).body!.cancel();
    expect(() => service.open('extra', fixture().start)).toThrow('capacity');
    for (const run of runs) {
      run.controller.close();
      run.resolve();
    }
    await service.onModuleDestroy();
  });
});
