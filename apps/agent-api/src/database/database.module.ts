import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  databaseOptions,
  createMigratedDataSource,
} from '@cat-supplies-store/database';
import type { DatabaseConfig } from '@cat-supplies-store/config';
import * as pg from 'pg';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...databaseOptions({
          ...config.getOrThrow<DatabaseConfig>('database'),
          max: 30,
        }),
        driver: pg,
      }),
      dataSourceFactory: createMigratedDataSource,
    }),
  ],
})
export class DatabaseModule {}
