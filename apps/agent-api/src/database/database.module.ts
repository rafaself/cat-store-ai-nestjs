import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  databaseOptions,
  createMigratedDataSource,
} from '@cat-supplies-store/database';
import type { DatabaseConfig } from '@cat-supplies-store/config';
import * as pg from 'pg';

export const AGENT_DATABASE_TIMEOUTS = {
  statement_timeout: 10_000,
  lock_timeout: 2_000,
  query_timeout: 15_000,
} as const;

export function buildAgentDatabaseOptions(config: DatabaseConfig) {
  const options = databaseOptions({ ...config, max: 30 });
  return {
    ...options,
    extra: { ...options.extra, ...AGENT_DATABASE_TIMEOUTS },
    driver: pg,
  };
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildAgentDatabaseOptions(
          config.getOrThrow<DatabaseConfig>('database'),
        ),
      dataSourceFactory: createMigratedDataSource,
    }),
  ],
})
export class DatabaseModule {}
