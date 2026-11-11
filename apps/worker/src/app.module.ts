import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '@nestjs/ai';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { resolve } from 'node:path';
import { createBedrockConfig, buildAiOptions } from '@cat-supplies-store/ai';
import { readEnvironment } from '@cat-supplies-store/config';
import { migrateDatabase } from '@cat-supplies-store/database';
import {
  createWorkerConfig,
  buildWorkerDatabaseOptions,
  buildWorkerQueueOptions,
} from './config/worker.config';
import { EmailModule } from './apps/email/email.module';

const environment = readEnvironment(resolve(__dirname, '../../../.env'));
const bedrockConfig = createBedrockConfig(environment);
const workerConfig = createWorkerConfig(environment);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      // Named factories use the snapshot, so Nest need not copy values into process.env.
      validate: () => ({}),
      load: [bedrockConfig, workerConfig],
    }),
    AiModule.forRootAsync({
      isGlobal: true,
      inject: [bedrockConfig.KEY],
      useFactory: buildAiOptions,
    }),
    TypeOrmModule.forRootAsync({
      inject: [workerConfig.KEY],
      useFactory: buildWorkerDatabaseOptions,
      dataSourceFactory: async (options) => {
        if (!options) throw new Error('Database options are required.');
        const dataSource = await new DataSource(options).initialize();
        try {
          await migrateDatabase(dataSource);
        } catch (error) {
          await dataSource.destroy();
          throw error;
        }
        return dataSource;
      },
    }),
    BullModule.forRootAsync({
      inject: [workerConfig.KEY],
      useFactory: buildWorkerQueueOptions,
    }),
    EmailModule,
  ],
})
export class AppModule {}
