import { Module } from '@nestjs/common';
import { SupportApprovalGuard } from '../auth/demo-auth.guard';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogTools } from './catalog.tools';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, CatalogTools, SupportApprovalGuard],
  exports: [CatalogService],
})
export class CatalogModule {}
