export interface CustomerEntity {
  id: string;
  name: string;
}

export interface PaymentEntity {
  id: string;
  amount_cents: number;
  refunded_cents: number;
  status: 'captured' | 'partially_refunded' | 'refunded';
}

export interface OrderEntity {
  id: string;
  customer_id: string;
  payment_id: string;
  status: string;
  total_cents: number;
  delivery_address: string;
  refundable: boolean;
}

export interface ProductEntity {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  embedding: string | null;
}

export interface PaymentRefundEntity {
  idempotency_key: string;
  payment_id: string;
  amount_cents: number;
  created_at: Date;
}
