import { AgentFunction, type AgentFunctionContext } from '@nestjs/ai';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  BusinessApiClient,
  type CustomerRequest,
} from '../../../integrations/business-api/business-api.client';

@Injectable()
export class CatalogTools {
  constructor(private readonly catalog: BusinessApiClient) {}

  @AgentFunction({
    name: 'search-products',
    description: 'Find cat-store products by meaning and customer needs.',
    inputSchema: z.object({
      query: z.string().trim().min(2).max(500),
    }),
  })
  searchProducts({ query }: { query: string }, context: AgentFunctionContext) {
    return this.catalog.searchProducts(
      query,
      context.request as CustomerRequest | undefined,
      context.signal,
    );
  }
}
