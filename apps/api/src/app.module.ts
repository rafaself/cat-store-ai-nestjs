import { Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';
import { WorkflowsModule } from '@nestjs/workflows';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  databaseConfig,
  buildDatabaseOptions,
} from './database/database.config';
import { DatabaseService } from './database/database.service';
import { WorkflowPool } from './database/workflow-pool';
import { bedrockConfig, buildAiOptions } from './config/ai.config';
import {
  workflowsConfig,
  buildWorkflowOptions,
} from './config/workflows.config';
import {
  postgresWorkflowStoreProvider,
  WORKFLOW_DATABASE_POOL,
} from '@llm-chatbot-nestjs/workflow-storage';
import { AssistantModule } from './apps/assistant/assistant.module';
import { CatalogModule } from './apps/catalog/catalog.module';
import { OrdersModule } from './apps/orders/orders.module';
import { PaymentsModule } from './apps/payments/payments.module';
import { RefundsModule } from './apps/refunds/refunds.module';
import { HealthController } from './health.controller';
import { validateEnvironment } from '@llm-chatbot-nestjs/config';
import { SupportModule } from './apps/support/support.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(__dirname, '../../../.env'),
      validate: validateEnvironment,
      load: [databaseConfig, bedrockConfig, workflowsConfig],
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
