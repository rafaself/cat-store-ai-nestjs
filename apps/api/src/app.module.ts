import type { DatabaseConfig } from '@cat-supplies-store/config';
import { BullModule } from '@nestjs/bullmq';
import { buildQueueOptions } from './config/queue.config';
import { EmailJobsModule } from './apps/email-jobs/email-jobs.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { AgentOperationsModule } from './apps/agent-operations/agent-operations.module';
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { AiModule } from '@nestjs/ai';
import { WorkflowsModule } from '@nestjs/workflows';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { WorkflowPersistenceModule } from '@cat-supplies-store/workflow-storage';
import { buildEmbeddingOptions } from '@cat-supplies-store/ai';
import { buildWorkflowClientOptions } from '@cat-supplies-store/workflow-storage';
import { CatalogModule } from './apps/catalog/catalog.module';
import { OrdersModule } from './apps/orders/orders.module';
import { RefundsModule } from './apps/refunds/refunds.module';
import { HealthController } from './health.controller';
import {
  appConfigOptions,
  databaseConfig,
  bedrockConfig,
  workflowsConfig,
  queueConfig,
} from './app.config';

@Module({
  imports: [
    ConfigModule.forRoot(appConfigOptions),
    DatabaseModule,
    AiModule.forRootAsync({
      isGlobal: true,
      inject: [bedrockConfig.KEY],
      useFactory: buildEmbeddingOptions,
    }),
    WorkflowsModule.forRootAsync({
      inject: [workflowsConfig.KEY],
      useFactory: buildWorkflowClientOptions,
    }),
    WorkflowPersistenceModule.registerAsync({
      inject: [databaseConfig.KEY],
      useFactory: (config: DatabaseConfig) => config,
    }),
    BullModule.forRootAsync({
      inject: [queueConfig.KEY],
      useFactory: buildQueueOptions,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    AgentOperationsModule,
    EmailJobsModule,
    OrdersModule,
    CatalogModule,
    RefundsModule,
  ],
  providers: [{ provide: APP_PIPE, useClass: StandardSchemaValidationPipe }],
  controllers: [HealthController],
})
export class AppModule {}
