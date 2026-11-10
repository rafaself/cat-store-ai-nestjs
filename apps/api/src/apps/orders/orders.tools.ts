import { AgentFunction, type AgentFunctionContext } from '@nestjs/ai';
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';
import { OrdersService } from './orders.service';

function customerIdFrom(context: AgentFunctionContext): string {
  const user =
    (context.request as { user?: { id?: unknown } } | undefined)?.user ??
    (context.user as { id?: unknown } | undefined);
  if (typeof user?.id !== 'string') {
    throw new UnauthorizedException('A customer identity is required.');
  }
  return user.id;
}

@Injectable()
export class OrdersTools {
  constructor(private readonly orders: OrdersService) {}

  @AgentFunction({
    name: 'find-order',
    description: 'Find an order that belongs to the authenticated customer.',
    inputSchema: z.object({ orderId: z.string().min(1).max(80) }),
  })
  async findOrder(
    { orderId }: { orderId: string },
    context: AgentFunctionContext,
  ) {
    const order = await this.orders.findForCustomer(
      customerIdFrom(context),
      orderId,
    );
    if (!order) throw new NotFoundException('Order not found.');
    return order;
  }

  @AgentFunction({
    name: 'change-address',
    description: 'Change the delivery address of an eligible customer order.',
    inputSchema: z.object({
      orderId: z.string().min(1).max(80),
      address: z.string().trim().min(8).max(300),
    }),
  })
  async changeAddress(
    { orderId, address }: { orderId: string; address: string },
    context: AgentFunctionContext,
  ) {
    const order = await this.orders.changeAddress(
      customerIdFrom(context),
      orderId,
      address,
    );
    if (!order) {
      throw new NotFoundException(
        'Order not found or its address can no longer be changed.',
      );
    }
    return order;
  }
}
