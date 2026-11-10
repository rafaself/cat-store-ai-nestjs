export interface PaymentEntity {
  id: string;
  amount_cents: number;
  refunded_cents: number;
  status: 'captured' | 'partially_refunded' | 'refunded';
}
