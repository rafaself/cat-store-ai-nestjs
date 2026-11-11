import { BullModule } from '@nestjs/bullmq';
import { buildQueueOptions } from './config/queue.config';
import { EmailJobsModule } from './apps/email-jobs/email-jobs.module';
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { AiModule } from '@nestjs/ai';
import { WorkflowsModule } from '@nestjs/workflows';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { WorkflowPersistenceModule } from './database/workflow-persistence.module';
import { buildAiOptions } from '@cat-supplies-store/ai';
import { buildWorkflowOptions } from './config/workflows.config';
import { AssistantModule } from './apps/assistant/assistant.module';
import { CatalogModule } from './apps/catalog/catalog.module';
import { OrdersModule } from './apps/orders/orders.module';
import { PaymentsModule } from './apps/payments/payments.module';
import { RefundsModule } from './apps/refunds/refunds.module';
import { HealthController } from './health.controller';
import { SupportModule } from './apps/support/support.module';
import {
  appConfigOptions,
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
      useFactory: buildAiOptions,
    }),
    WorkflowsModule.forRootAsync({
      inject: [workflowsConfig.KEY],
      useFactory: buildWorkflowOptions,
    }),
    WorkflowPersistenceModule,
    BullModule.forRootAsync({
      inject: [queueConfig.KEY],
      useFactory: buildQueueOptions,
    }),
    EmailJobsModule,
    OrdersModule,
    SupportModule,
    PaymentsModule,
    CatalogModule,
    RefundsModule,
    AssistantModule,
  ],
  providers: [{ provide: APP_PIPE, useClass: StandardSchemaValidationPipe }],
  controllers: [HealthController],
})
export class AppModule {}
