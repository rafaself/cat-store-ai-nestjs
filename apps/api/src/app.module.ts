import { Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';
import { AesGcmPayloadCodec, WorkflowsModule } from '@nestjs/workflows';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import { databaseOptions } from '@llm-chatbot-nestjs/database';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as pg from 'pg';
import { DatabaseService } from './database/database.service';
import { WorkflowPool } from './database/workflow-pool';
import type {
  BedrockConfig,
  DatabaseConfig,
  WorkflowConfig,
} from '@llm-chatbot-nestjs/config';
import {
  postgresWorkflowStoreProvider,
  WORKFLOW_DATABASE_POOL,
} from '@llm-chatbot-nestjs/workflow-storage';
import { AssistantModule } from './assistant/assistant.module';
import { CatalogModule } from './catalog/catalog.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { RefundsModule } from './refunds/refunds.module';
import { HealthController } from './health.controller';
import { validateEnvironment } from '@llm-chatbot-nestjs/config';
import { SupportModule } from './support/support.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(__dirname, '../../../.env'),
      validate: validateEnvironment,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...databaseOptions(config.getOrThrow<DatabaseConfig>('database')),
        driver: pg,
      }),
    }),
    AiModule.forRootAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const bedrock = config.getOrThrow<BedrockConfig>('bedrock');
        process.env.AWS_REGION = bedrock.region;
        if (bedrock.bearerToken) {
          process.env.AWS_BEARER_TOKEN_BEDROCK = bedrock.bearerToken;
        } else {
          delete process.env.AWS_BEARER_TOKEN_BEDROCK;
        }
        const { amazonBedrock } = await import('@ai-sdk/amazon-bedrock');
        return {
          models: {
            default: amazonBedrock(bedrock.modelId),
          },
          embeddingModels: {
            default: amazonBedrock.embedding(bedrock.embeddingModelId),
          },
          defaults: bedrock.defaults,
          embeddingDefaults: bedrock.embeddingDefaults,
        };
      },
    }),
    WorkflowsModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const workflows = config.getOrThrow<WorkflowConfig>('workflows');
        return {
          worker: workflows.worker,
          retry: workflows.retry,
          codec: new AesGcmPayloadCodec({
            keys: { local: workflows.encryptionKey },
            current: 'local',
          }),
        };
      },
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
