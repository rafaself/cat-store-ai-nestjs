import { WorkflowsModule } from '@nestjs/workflows';
import { RefundExecutionModule } from '@cat-supplies-store/refunds';
import {
  WorkflowPersistenceModule,
  buildWorkflowOptions,
} from '@cat-supplies-store/workflow-storage';
import type { WorkerConfig } from './config/worker.config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '@nestjs/ai';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildAiOptions } from '@cat-supplies-store/ai';
import { createMigratedDataSource } from '@cat-supplies-store/database';
import {
  buildWorkerDatabaseOptions,
  buildWorkerQueueOptions,
} from './config/worker.config';
import { EmailModule } from './apps/email/email.module';

import {
  appConfigOptions,
  bedrockConfig,
  workerConfig,
  workflowsConfig,
} from './app.config';

@Module({
  imports: [
    ConfigModule.forRoot(appConfigOptions),
    AiModule.forRootAsync({
      isGlobal: true,
      inject: [bedrockConfig.KEY],
      useFactory: buildAiOptions,
    }),
    TypeOrmModule.forRootAsync({
      inject: [workerConfig.KEY],
      useFactory: buildWorkerDatabaseOptions,
      dataSourceFactory: createMigratedDataSource,
    }),
    BullModule.forRootAsync({
      inject: [workerConfig.KEY],
      useFactory: buildWorkerQueueOptions,
    }),
    WorkflowsModule.forRootAsync({
      inject: [workflowsConfig.KEY],
      useFactory: buildWorkflowOptions,
    }),
    WorkflowPersistenceModule.registerAsync({
      inject: [workerConfig.KEY],
      useFactory: (config: WorkerConfig) => config.database,
    }),
    RefundExecutionModule,
    EmailModule,
  ],
})
export class AppModule {}
