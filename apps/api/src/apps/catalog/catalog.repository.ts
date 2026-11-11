import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEntity } from '@cat-supplies-store/database';
import { RepositoryDatabase } from '../../database/repository-database';
import type { ProductSearchResult } from '@cat-supplies-store/shared';

export interface ProductToIndex {
  id: string;
  name: string;
  description: string;
}

@Injectable()
export class CatalogRepository {
  private readonly database: RepositoryDatabase;

  constructor(
    @InjectRepository(ProductEntity)
    private readonly repository: Repository<ProductEntity>,
  ) {
    this.database = new RepositoryDatabase(this.repository.manager);
  }

  async findProductsToIndex(): Promise<ProductToIndex[]> {
    return this.repository.find({
      select: { id: true, name: true, description: true },
      order: { id: 'ASC' },
    });
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
