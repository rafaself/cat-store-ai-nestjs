import { AgentFunction, type AgentFunctionContext } from '@nestjs/ai';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  orderIdSchema,
  changeAddressSchema,
} from '@cat-supplies-store/contracts';
import { BusinessApiClient, type CustomerRequest } from './business-api.client';

@Injectable()
export class OrdersTools {
  constructor(private readonly orders: BusinessApiClient) {}

  @AgentFunction({
    name: 'find-order',
    description: 'Find an order that belongs to the authenticated customer.',
    inputSchema: z.object({ orderId: orderIdSchema }),
  })
  async findOrder(
    { orderId }: { orderId: string },
    context: AgentFunctionContext,
  ) {
    return this.orders.findOrder(
      orderId,
      context.request as CustomerRequest | undefined,
      context.signal,
    );
  }

  @AgentFunction({
    name: 'change-address',
    description: 'Change the delivery address of an eligible customer order.',
    inputSchema: changeAddressSchema.extend({ orderId: orderIdSchema }),
  })
  async changeAddress(
    { orderId, address }: { orderId: string; address: string },
    context: AgentFunctionContext,
  ) {
    return this.orders.changeAddress(
      orderId,
      address,
      context.request as CustomerRequest | undefined,
      context.signal,
    );
  }
}
