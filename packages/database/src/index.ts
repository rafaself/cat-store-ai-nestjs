export { DATABASE_POOL } from './database.constants.js';
export { DatabaseModule } from './database.module.js';
export type {
  DatabaseModuleAsyncOptions,
  DatabaseModuleOptions,
} from './database.module.js';
export { DatabaseService } from './database.service.js';
export type { Pool as DatabasePool } from 'pg';
export type { CustomerEntity } from './customers/customer.entity.js';
export type { ProductEntity } from './catalog/catalog.entity.js';
export {
  CatalogRepository,
  type ProductToIndex,
} from './catalog/catalog.repository.js';
export type { OrderEntity } from './orders/order.entity.js';
export {
  OrdersRepository,
  type CustomerOrder,
} from './orders/orders.repository.js';
export type { PaymentEntity } from './payments/payment.entity.js';
export type { PaymentRefundEntity } from './payments/payment-refund.entity.js';
export {
  PaymentsRepository,
  type PersistedRefund,
  type RefundPersistenceResult,
} from './payments/payments.repository.js';
