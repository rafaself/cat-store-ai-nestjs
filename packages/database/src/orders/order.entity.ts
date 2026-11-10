export interface OrderEntity {
  id: string;
  customer_id: string;
  payment_id: string;
  status: string;
  total_cents: number;
  delivery_address: string;
  refundable: boolean;
}
