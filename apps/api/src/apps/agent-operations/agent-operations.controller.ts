import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  catalogSearchQuerySchema,
  catalogSearchResponseSchema,
  changeAddressSchema,
  customerOrderSchema,
  orderIdSchema,
  type ChangeAddress,
  type CatalogSearchQuery,
} from '@cat-supplies-store/contracts';
import { DemoCustomerGuard } from '../../auth/demo-auth.guard';
import { CurrentCustomer } from '../../auth/current-customer.decorator';
import type { DemoCustomer } from '../../auth/demo-auth.types';
import { OrdersService } from '../orders/orders.service';
import { CatalogService } from '../catalog/catalog.service';

@Controller('agent-tools')
@UseGuards(DemoCustomerGuard)
export class AgentOperationsController {
  constructor(
    private readonly orders: OrdersService,
    private readonly catalog: CatalogService,
  ) {}

  @Get('customer')
  customer(@CurrentCustomer() customer: DemoCustomer) {
    return customer;
  }

  @Get('orders/:orderId')
  async findOrder(
    @CurrentCustomer() customer: DemoCustomer,
    @Param('orderId', { schema: orderIdSchema }) orderId: string,
  ) {
    const order = await this.orders.findForCustomer(customer.id, orderId);
    if (!order) throw new NotFoundException('Order not found.');
    return customerOrderSchema.parse(order);
  }

  @Patch('orders/:orderId/address')
  async changeAddress(
    @CurrentCustomer() customer: DemoCustomer,
    @Param('orderId', { schema: orderIdSchema }) orderId: string,
    @Body({ schema: changeAddressSchema }) body: ChangeAddress,
  ) {
    const order = await this.orders.changeAddress(
      customer.id,
      orderId,
      body.address,
    );
    if (!order)
      throw new NotFoundException(
        'Order not found or its address can no longer be changed.',
      );
    return customerOrderSchema.parse(order);
  }

  @Get('catalog/search')
  async search(
    @Query('q', { schema: catalogSearchQuerySchema.shape.q })
    query: CatalogSearchQuery['q'],
    @Query('limit', { schema: catalogSearchQuerySchema.shape.limit })
    limit: CatalogSearchQuery['limit'],
  ) {
    return catalogSearchResponseSchema.parse(
      await this.catalog.search(query, limit),
    );
  }
}
