import { Injectable } from '@nestjs/common';
import { OrdersRepository, type CustomerOrder } from './orders.repository';

export type OrderRecord = CustomerOrder;

@Injectable()
export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  async findForCustomer(
    customerId: string,
    orderId: string,
  ): Promise<OrderRecord | null> {
    return this.orders.findForCustomer(customerId, orderId);
  }

  async changeAddress(
    customerId: string,
    orderId: string,
    address: string,
    confirmationId: string,
  ): Promise<OrderRecord | null> {
    return this.orders.changeAddress(
      customerId,
      orderId,
      address,
      confirmationId,
    );
  }

  proposeAddressChange(customerId: string, orderId: string, address: string) {
    return this.orders.proposeAddressChange(customerId, orderId, address);
  }

  approveAddressChange(
    customerId: string,
    confirmationId: string,
    orderId: string,
    address: string,
  ) {
    return this.orders.approveAddressChange(
      customerId,
      confirmationId,
      orderId,
      address,
    );
  }
}
