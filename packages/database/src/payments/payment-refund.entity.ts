export interface PaymentRefundEntity {
  idempotency_key: string;
  payment_id: string;
  amount_cents: number;
  created_at: Date;
}
