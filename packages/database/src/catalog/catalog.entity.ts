export interface ProductEntity {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  embedding: string | null;
}
