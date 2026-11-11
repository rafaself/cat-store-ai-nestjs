import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductEntity } from '@cat-supplies-store/database';
import { CatalogRepository } from './catalog.repository';
import { Module } from '@nestjs/common';
import { SupportApprovalGuard } from '../../auth/demo-auth.guard';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductEntity])],
  controllers: [CatalogController],
  providers: [CatalogRepository, CatalogService, SupportApprovalGuard],
  exports: [CatalogService],
})
export class CatalogModule {}
