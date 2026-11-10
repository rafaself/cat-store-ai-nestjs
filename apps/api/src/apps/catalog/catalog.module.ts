import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductEntity } from '@llm-chatbot-nestjs/database';
import { CatalogRepository } from './catalog.repository';
import { Module } from '@nestjs/common';
import { SupportApprovalGuard } from '../../auth/demo-auth.guard';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogTools } from './catalog.tools';

@Module({
  imports: [TypeOrmModule.forFeature([ProductEntity])],
  controllers: [CatalogController],
  providers: [
    CatalogRepository,
    CatalogService,
    CatalogTools,
    SupportApprovalGuard,
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
