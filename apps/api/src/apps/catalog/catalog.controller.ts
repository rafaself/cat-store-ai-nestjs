import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  catalogIndexResponseSchema,
  catalogSearchQuerySchema,
  catalogSearchResponseSchema,
} from '@cat-supplies-store/contracts';
import { SupportApprovalGuard } from '../../auth/demo-auth.guard';
import { CatalogService } from './catalog.service';

@Controller('catalog')
@UseGuards(ThrottlerGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('search')
  async search(@Query('q') query?: string, @Query('limit') rawLimit?: string) {
    const parsed = catalogSearchQuerySchema.safeParse({
      q: query,
      limit: rawLimit,
    });
    if (!parsed.success && parsed.error.issues[0]?.path[0] === 'q') {
      throw new BadRequestException(
        'Provide a search query of at most 500 characters.',
      );
    }
    if (!parsed.success) {
      throw new BadRequestException('Limit must be an integer from 1 to 10.');
    }
    return catalogSearchResponseSchema.parse(
      await this.catalog.search(parsed.data.q, parsed.data.limit),
    );
  }

  @Post('index')
  @UseGuards(SupportApprovalGuard)
  async index() {
    return catalogIndexResponseSchema.parse(await this.catalog.indexProducts());
  }
}
