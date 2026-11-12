import { AgentFunction, type AgentFunctionContext } from '@nestjs/ai';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  orderIdSchema,
  addressChangeToolInputSchema,
  type AddressChangeToolInput,
} from '@cat-supplies-store/contracts';
import {
  BusinessApiClient,
  type CustomerRequest,
} from '../../../integrations/business-api/business-api.client';

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
    description:
      'Propose an address change. The user must approve it with the chat confirmation button. Only then call again with its confirmationId to execute the exact approved change.',
    inputSchema: addressChangeToolInputSchema,
  })
  async changeAddress(
    { orderId, address, confirmationId }: AddressChangeToolInput,
    context: AgentFunctionContext,
  ) {
    if (!confirmationId) {
      return this.orders.proposeAddressChange(
        orderId,
        address,
        context.request as CustomerRequest | undefined,
        context.signal,
      );
    }
    return this.orders.changeAddress(
      orderId,
      address,
      confirmationId,
      context.request as CustomerRequest | undefined,
      context.signal,
    );
  }
}
