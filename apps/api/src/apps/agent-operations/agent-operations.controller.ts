import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  catalogSearchQuerySchema,
  catalogSearchResponseSchema,
  changeAddressSchema,
  confirmedAddressChangeSchema,
  addressChangeProposalSchema,
  addressConfirmationIdSchema,
  approveAddressChangeSchema,
  customerOrderSchema,
  orderIdSchema,
  type ChangeAddress,
  type ConfirmedAddressChange,
  type ApproveAddressChange,
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
    @Body({ schema: confirmedAddressChangeSchema })
    body: ConfirmedAddressChange,
  ) {
    const order = await this.orders.changeAddress(
      customer.id,
      orderId,
      body.address,
      body.confirmationId,
    );
    if (!order)
      throw new NotFoundException(
        'Order not found or its address can no longer be changed.',
      );
    return customerOrderSchema.parse(order);
  }

  @Post('orders/:orderId/address-confirmations')
  async proposeAddressChange(
    @CurrentCustomer() customer: DemoCustomer,
    @Param('orderId', { schema: orderIdSchema }) orderId: string,
    @Body({ schema: changeAddressSchema }) body: ChangeAddress,
  ) {
    const proposal = await this.orders.proposeAddressChange(
      customer.id,
      orderId,
      body.address,
    );
    if (!proposal)
      throw new NotFoundException(
        'Order not found or its address can no longer be changed.',
      );
    return addressChangeProposalSchema.parse(proposal);
  }

  // Deliberately not exposed as an agent tool: only the user's explicit UI action approves.
  @Post('address-confirmations/:confirmationId/approve')
  async approveAddressChange(
    @CurrentCustomer() customer: DemoCustomer,
    @Param('confirmationId', { schema: addressConfirmationIdSchema })
    confirmationId: string,
    @Body({ schema: approveAddressChangeSchema }) body: ApproveAddressChange,
  ) {
    if (
      !(await this.orders.approveAddressChange(
        customer.id,
        confirmationId,
        body.orderId,
        body.address,
      ))
    ) {
      throw new ForbiddenException('Confirmation is unavailable or expired.');
    }
    return { approved: true };
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
