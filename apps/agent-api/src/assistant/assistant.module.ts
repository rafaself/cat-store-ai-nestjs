import { BusinessApiClient } from '../business-api.client';
import { OrdersTools } from '../orders.tools';
import { CatalogTools } from '../catalog.tools';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { BusinessApiGuard } from '../business-api.guard';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    BusinessApiGuard,
    BusinessApiClient,
    OrdersTools,
    CatalogTools,
  ],
})
export class AssistantModule {}
