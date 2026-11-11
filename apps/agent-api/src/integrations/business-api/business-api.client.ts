import {
  Injectable,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  catalogSearchResponseSchema,
  customerIdentitySchema,
  customerOrderSchema,
} from '@cat-supplies-store/contracts';
import type { z } from 'zod';

export interface CustomerRequest {
  headers: { authorization?: string | string[] };
}

@Injectable()
export class BusinessApiClient {
  constructor(private readonly config: ConfigService) {}

  private async request<T>(
    path: string,
    caller: CustomerRequest | undefined,
    schema: z.ZodType<T>,
    body?: { address: string },
    signal?: AbortSignal,
  ): Promise<T> {
    const authorization = caller?.headers.authorization;
    if (typeof authorization !== 'string')
      throw new UnauthorizedException('A customer identity is required.');
    try {
      const response = await fetch(
        `${this.config.getOrThrow<string>('businessApi.url')}/agent-tools/${path}`,
        {
          method: body ? 'PATCH' : 'GET',
          headers: {
            authorization,
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(35_000)])
            : AbortSignal.timeout(35_000),
          redirect: 'error',
        },
      );
      if (!response.ok) {
        if ([400, 401, 403, 404, 429].includes(response.status)) {
          throw new HttpException(
            'Business operation rejected.',
            response.status,
          );
        }
        throw new ServiceUnavailableException('Business API is unavailable.');
      }
      return schema.parse(await response.json());
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Business API is unavailable.');
    }
  }

  authenticate(caller: CustomerRequest) {
    return this.request('customer', caller, customerIdentitySchema);
  }

  findOrder(
    orderId: string,
    caller: CustomerRequest | undefined,
    signal?: AbortSignal,
  ) {
    return this.request(
      `orders/${encodeURIComponent(orderId)}`,
      caller,
      customerOrderSchema,
      undefined,
      signal,
    );
  }

  changeAddress(
    orderId: string,
    address: string,
    caller: CustomerRequest | undefined,
    signal?: AbortSignal,
  ) {
    return this.request(
      `orders/${encodeURIComponent(orderId)}/address`,
      caller,
      customerOrderSchema,
      { address },
      signal,
    );
  }

  searchProducts(
    query: string,
    caller: CustomerRequest | undefined,
    signal?: AbortSignal,
  ) {
    return this.request(
      `catalog/search?${new URLSearchParams({ q: query, limit: '5' })}`,
      caller,
      catalogSearchResponseSchema,
      undefined,
      signal,
    );
  }
}
