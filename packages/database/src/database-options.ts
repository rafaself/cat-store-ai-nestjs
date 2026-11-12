import type { DataSourceOptions } from 'typeorm';
import { ProductEntity } from './catalog/catalog.entity.js';
import { CustomerEntity } from './customers/customer.entity.js';
import { OrderEntity } from './orders/order.entity.js';
import { PaymentEntity } from './payments/payment.entity.js';
import { PaymentRefundEntity } from './payments/payment-refund.entity.js';
import { EmailDraftEntity } from './email/email-draft.entity.js';
import { AddressChangeConfirmationEntity } from './orders/address-change-confirmation.entity.js';

export function databaseOptions(options: {
  connectionString: string;
  max?: number;
  connectionTimeoutMillis?: number;
}): DataSourceOptions {
  return {
    type: 'postgres',
    url: options.connectionString,
    entities: [
      CustomerEntity,
      OrderEntity,
      PaymentEntity,
      PaymentRefundEntity,
      ProductEntity,
      EmailDraftEntity,
      AddressChangeConfirmationEntity,
    ],
    synchronize: false,
    extra: {
      max: options.max,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
    },
  };
}
