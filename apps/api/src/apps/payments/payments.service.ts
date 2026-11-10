import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentsRepository,
  type PersistedRefund,
} from './payments.repository';

export interface SimulatedRefund extends PersistedRefund {
  status: 'simulated';
}

@Injectable()
export class PaymentsService {
  constructor(private readonly payments: PaymentsRepository) {}

  async refundOrder(
    customerId: string,
    orderId: string,
    idempotencyKey: string,
  ): Promise<SimulatedRefund> {
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new ConflictException(
        'A durable refund idempotency key is required.',
      );
    }

    const result = await this.payments.refundOrder(
      customerId,
      orderId,
      idempotencyKey,
    );
    switch (result.status) {
      case 'success':
        return { ...result.refund, status: 'simulated' };
      case 'not_found':
        throw new NotFoundException('Refundable order not found.');
      case 'idempotency_conflict':
        throw new ConflictException('Refund idempotency key was already used.');
      case 'ineligible':
        throw new ConflictException('This order is not eligible for a refund.');
    }
  }
}
