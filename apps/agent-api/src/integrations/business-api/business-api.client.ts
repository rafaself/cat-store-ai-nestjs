import {
  Injectable,
  Logger,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  catalogSearchResponseSchema,
  customerIdentitySchema,
  customerOrderSchema,
  addressChangeProposalSchema,
} from '@cat-supplies-store/contracts';
import type { z } from 'zod';

export interface CustomerRequest {
  headers: { authorization?: string | string[] };
}

@Injectable()
export class BusinessApiClient {
  private readonly logger = new Logger(BusinessApiClient.name);

  constructor(private readonly config: ConfigService) {}

  private async request<T>(
    path: string,
    caller: CustomerRequest | undefined,
    schema: z.ZodType<T>,
    body?: { address: string; confirmationId?: string },
    signal?: AbortSignal,
    method = body ? 'PATCH' : 'GET',
  ): Promise<T> {
    const authorization = caller?.headers.authorization;
    if (typeof authorization !== 'string')
      throw new UnauthorizedException('A customer identity is required.');
    try {
      const response = await fetch(
        `${this.config.getOrThrow<string>('businessApi.url')}/agent-tools/${path}`,
        {
          method,
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
        const error = [400, 401, 403, 404, 429].includes(response.status)
          ? new HttpException('Business operation rejected.', response.status)
          : new ServiceUnavailableException('Business API is unavailable.');
        try {
          await response.body?.cancel();
        } catch {
          this.logger.warn(
            'Failed to release a rejected Business API response.',
          );
        }
        throw error;
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
    confirmationId: string,
    caller: CustomerRequest | undefined,
    signal?: AbortSignal,
  ) {
    return this.request(
      `orders/${encodeURIComponent(orderId)}/address`,
      caller,
      customerOrderSchema,
      { address, confirmationId },
      signal,
    );
  }

  proposeAddressChange(
    orderId: string,
    address: string,
    caller: CustomerRequest | undefined,
    signal?: AbortSignal,
  ) {
    return this.request(
      `orders/${encodeURIComponent(orderId)}/address-confirmations`,
      caller,
      addressChangeProposalSchema,
      { address },
      signal,
      'POST',
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
