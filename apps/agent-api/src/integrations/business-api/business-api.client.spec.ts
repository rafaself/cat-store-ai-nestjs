import { ConfigService } from '@nestjs/config';
import {
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BusinessApiClient } from './business-api.client';

const caller = { headers: { authorization: 'Bearer customer-token' } };
const order = {
  id: 'ord_123',
  status: 'processing',
  totalCents: 100,
  deliveryAddress: 'Demo address',
  refundable: true,
};
const client = () =>
  new BusinessApiClient(
    new ConfigService({ businessApi: { url: 'http://business-api:3000' } }),
  );

afterEach(() => vi.unstubAllGlobals());

describe('BusinessApiClient', () => {
  it('forwards credentials and encoded parameters, and validates the order contract', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(order));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      client().changeAddress(
        'order/with/slashes',
        'A new delivery address',
        caller,
      ),
    ).resolves.toEqual(order);
    expect(fetcher).toHaveBeenCalledWith(
      'http://business-api:3000/agent-tools/orders/order%2Fwith%2Fslashes/address',
      expect.objectContaining({
        method: 'PATCH',
        headers: {
          authorization: 'Bearer customer-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ address: 'A new delivery address' }),
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('propagates tool cancellation to the HTTP request', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(order));
    vi.stubGlobal('fetch', fetcher);
    const abort = new AbortController();
    await client().findOrder('ord_123', caller, abort.signal);
    const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    abort.abort();
    expect(signal.aborted).toBe(true);
  });

  it('requires credentials instead of trusting a supplied customer identity', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      client().findOrder('ord_123', undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 429])(
    'preserves a business rejection (%s)',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('private details', { status })),
      );
      try {
        await client().findOrder('ord_123', caller);
        expect.unreachable('The request must fail');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(status);
        expect((error as Error).message).not.toContain('private details');
      }
    },
  );

  it.each(['network', 'invalid-contract', 'server-error'])(
    'fails safely for %s',
    async (failure) => {
      const fetcher = vi.fn();
      if (failure === 'network')
        fetcher.mockRejectedValue(new Error('private host details'));
      else
        fetcher.mockResolvedValue(
          failure === 'invalid-contract'
            ? Response.json({})
            : new Response('private details', { status: 500 }),
        );
      vi.stubGlobal('fetch', fetcher);
      await expect(client().findOrder('ord_123', caller)).rejects.toThrow(
        new ServiceUnavailableException('Business API is unavailable.'),
      );
    },
  );
});
