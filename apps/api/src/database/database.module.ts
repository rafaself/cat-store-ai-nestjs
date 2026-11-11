import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createMigratedDataSource } from '@cat-supplies-store/database';
import { buildDatabaseOptions, databaseConfigKey } from './database.config';
import { DatabaseService } from './database.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [databaseConfigKey],
      useFactory: buildDatabaseOptions,
      dataSourceFactory: createMigratedDataSource,
    }),
  ],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
