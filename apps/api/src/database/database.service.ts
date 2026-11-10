import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { migrationName, up } from '@llm-chatbot-nestjs/database';

@Injectable()
export class DatabaseService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      await runner.query('SELECT pg_advisory_xact_lock($1)', [824_031_122]);
      await runner.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const applied = await runner.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [migrationName],
      );
      if (!applied.length) {
        await up(runner);
        await runner.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
          migrationName,
        ]);
      }
      await runner.commitTransaction();
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async query<Row = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }> {
    const result = await this.dataSource.query(sql, values);
    return {
      rows: (Array.isArray(result[0]) && typeof result[1] === 'number'
        ? result[0]
        : result) as Row[],
    };
  }
}
