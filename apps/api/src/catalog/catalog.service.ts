import { Injectable } from '@nestjs/common';
import { AiService } from '@nestjs/ai';
import { CatalogRepository } from '@llm-chatbot-nestjs/database';
import type { ProductSearchResult } from '@llm-chatbot-nestjs/shared';

@Injectable()
export class CatalogService {
  constructor(
    private readonly ai: AiService,
    private readonly catalog: CatalogRepository,
  ) {}

  async indexProducts(): Promise<{ indexed: number }> {
    const products = await this.catalog.findProductsToIndex();
    if (products.length === 0) return { indexed: 0 };

    const inputs = products.map(
      (product) => `${product.name}\n${product.description}`,
    );
    const { embeddings } = await this.ai.embedMany({
      model: 'default',
      values: inputs,
      label: 'catalog-product-index',
    });
    if (embeddings.length !== products.length) {
      throw new Error(
        'The embedding model returned an unexpected result count.',
      );
    }

    await this.catalog.updateEmbeddings(products, embeddings);
    return { indexed: products.length };
  }

  async search(query: string, limit = 5): Promise<ProductSearchResult[]> {
    const { embedding } = await this.ai.embed({
      model: 'default',
      value: query,
      label: 'catalog-product-search',
    });
    return this.catalog.search(embedding, limit);
  }
}
