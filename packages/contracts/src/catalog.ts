import { z } from 'zod';
import type { ProductSearchResult } from '@llm-chatbot-nestjs/shared';

const searchTermSchema = z
  .string()
  .min(1)
  .max(500)
  .transform((query) => query.trim())
  .refine((query) => query.length > 0);

const searchLimitSchema = z.preprocess(
  (value) => (value === undefined ? 5 : Number(value)),
  z.number().int().min(1).max(10),
);

export const catalogSearchQuerySchema = z
  .object({
    q: searchTermSchema,
    limit: searchLimitSchema,
  })
  .strict();

export const catalogSearchResultSchema: z.ZodType<ProductSearchResult> = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    priceCents: z.number().int(),
    similarity: z.number(),
  })
  .strict();

export const catalogSearchResponseSchema = z.array(catalogSearchResultSchema);

export const catalogIndexResponseSchema = z
  .object({ indexed: z.number().int().nonnegative() })
  .strict();

export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;
export type CatalogSearchResponse = ProductSearchResult[];
export type CatalogIndexResponse = z.infer<typeof catalogIndexResponseSchema>;
