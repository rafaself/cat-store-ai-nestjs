import { BullModule } from '@nestjs/bullmq';
import { createQueueConfig, buildQueueOptions } from './config/queue.config';
import { EmailJobsModule } from './apps/email-jobs/email-jobs.module';
import { Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';
import { WorkflowsModule } from '@nestjs/workflows';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  createDatabaseConfig,
  buildDatabaseOptions,
} from './database/database.config';
import { DatabaseService } from './database/database.service';
import { WorkflowPool } from './database/workflow-pool';
import { createBedrockConfig, buildAiOptions } from '@cat-supplies-store/ai';
import {
  createWorkflowsConfig,
  buildWorkflowOptions,
} from './config/workflows.config';
import {
  postgresWorkflowStoreProvider,
  WORKFLOW_DATABASE_POOL,
} from '@cat-supplies-store/workflow-storage';
import { AssistantModule } from './apps/assistant/assistant.module';
import { CatalogModule } from './apps/catalog/catalog.module';
import { OrdersModule } from './apps/orders/orders.module';
import { PaymentsModule } from './apps/payments/payments.module';
import { RefundsModule } from './apps/refunds/refunds.module';
import { HealthController } from './health.controller';
import {
  readEnvironment,
  validateEnvironment,
} from '@cat-supplies-store/config';
import { SupportModule } from './apps/support/support.module';

const environment = readEnvironment(resolve(__dirname, '../../../.env'));
const databaseConfig = createDatabaseConfig(environment);
const bedrockConfig = createBedrockConfig(environment);
const workflowsConfig = createWorkflowsConfig(environment);
const queueConfig = createQueueConfig(environment);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: () => validateEnvironment(environment),
      load: [databaseConfig, bedrockConfig, workflowsConfig, queueConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: buildDatabaseOptions,
    }),
    AiModule.forRootAsync({
      isGlobal: true,
      inject: [bedrockConfig.KEY],
      useFactory: buildAiOptions,
    }),
    WorkflowsModule.forRootAsync({
      inject: [workflowsConfig.KEY],
      useFactory: buildWorkflowOptions,
    }),
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
  providers: [
    DatabaseService,
    WorkflowPool,
    { provide: WORKFLOW_DATABASE_POOL, useExisting: WorkflowPool },
    postgresWorkflowStoreProvider,
  ],
  controllers: [HealthController],
})
export class AppModule {}
