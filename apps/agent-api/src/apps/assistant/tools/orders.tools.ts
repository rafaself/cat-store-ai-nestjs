import { AgentFunction, type AgentFunctionContext } from '@nestjs/ai';
import { executeTool } from './execute-tool';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  orderIdSchema,
  changeAddressSchema,
  type ChangeAddress,
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
    return executeTool(context, { orderId }, () =>
      this.orders.findOrder(
        orderId,
        context.request as CustomerRequest | undefined,
        context.signal,
      ),
    );
  }

  @AgentFunction({
    name: 'change-address',
    description:
      'Propose an address change. The user must approve and apply it with the confirmation button. This tool cannot apply changes.',
    inputSchema: changeAddressSchema
      .extend({ orderId: orderIdSchema })
      .strict(),
  })
  async changeAddress(
    { orderId, address }: ChangeAddress & { orderId: string },
    context: AgentFunctionContext,
  ) {
    return executeTool(context, { orderId, address }, () =>
      this.orders.proposeAddressChange(
        orderId,
        address,
        context.request as CustomerRequest | undefined,
        context.signal,
      ),
    );
  }
}
