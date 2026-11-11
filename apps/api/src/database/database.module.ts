import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createMigratedDataSource } from '@cat-supplies-store/database';
import { buildDatabaseOptions, databaseConfigKey } from './database.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [databaseConfigKey],
      useFactory: buildDatabaseOptions,
      dataSourceFactory: createMigratedDataSource,
    }),
  ],
})
export class DatabaseModule {}
