import { Injectable } from '@nestjs/common';
import type { ProductSearchResult } from '@llm-chatbot-nestjs/shared';
import { DatabaseService } from '../database.service.js';
import type { ProductEntity } from './catalog.entity.js';

export interface ProductToIndex {
  id: string;
  name: string;
  description: string;
}

@Injectable()
export class CatalogRepository {
  constructor(private readonly database: DatabaseService) {}

  async findProductsToIndex(): Promise<ProductToIndex[]> {
    const result = await this.database.query<
      Pick<ProductEntity, 'id' | 'name' | 'description'>
    >('SELECT id, name, description FROM products ORDER BY id');
    return result.rows;
  }

  async updateEmbeddings(
    products: ProductToIndex[],
    embeddings: number[][],
  ): Promise<void> {
    if (products.length !== embeddings.length) {
      throw new Error('Each product must have exactly one embedding.');
    }
    const encoded = embeddings.map(vectorLiteral);
    await this.database.transaction(async (client) => {
      for (const [index, product] of products.entries()) {
        await client.query(
          'UPDATE products SET embedding = $2::vector WHERE id = $1',
          [product.id, encoded[index]],
        );
      }
    });
  }

  async search(embedding: number[], limit = 5): Promise<ProductSearchResult[]> {
    const result = await this.database.query<
      Pick<ProductEntity, 'id' | 'name' | 'description' | 'price_cents'> & {
        similarity: number;
      }
    >(
      `SELECT id, name, description, price_cents,
              1 - (embedding <=> $1::vector) AS similarity
       FROM products WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector LIMIT $2`,
      [vectorLiteral(embedding), Math.max(1, Math.min(limit, 10))],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      priceCents: row.price_cents,
      similarity: row.similarity,
    }));
  }
}

function vectorLiteral(values: number[]): string {
  if (
    values.length !== 1024 ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('The embedding model must return 1024 finite dimensions.');
  }
  return `[${values.join(',')}]`;
}
