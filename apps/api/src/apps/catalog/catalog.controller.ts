import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  catalogIndexResponseSchema,
  catalogSearchQuerySchema,
  catalogSearchResponseSchema,
  type CatalogSearchQuery,
} from '@cat-supplies-store/contracts';
import { SupportApprovalGuard } from '../../auth/demo-auth.guard';
import { CatalogService } from './catalog.service';

@Controller('catalog')
@UseGuards(ThrottlerGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('search')
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

  @Post('index')
  @UseGuards(SupportApprovalGuard)
  async index() {
    return catalogIndexResponseSchema.parse(await this.catalog.indexProducts());
  }
}
