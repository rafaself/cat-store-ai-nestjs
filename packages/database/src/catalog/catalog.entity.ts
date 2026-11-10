import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('products')
export class ProductEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'integer' })
  price_cents!: number;

  @Column({ type: 'vector', length: 1024, nullable: true })
  embedding!: string | null;
}
