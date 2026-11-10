import { AgentFunction, type AgentFunctionContext } from '@nestjs/ai';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CatalogService } from './catalog.service';

@Injectable()
export class CatalogTools {
  constructor(private readonly catalog: CatalogService) {}

  @AgentFunction({
    name: 'search-products',
    description: 'Find cat-store products by meaning and customer needs.',
    inputSchema: z.object({
      query: z.string().trim().min(2).max(500),
    }),
  })
  searchProducts({ query }: { query: string }, _context: AgentFunctionContext) {
    return this.catalog.search(query, 5);
  }
}
