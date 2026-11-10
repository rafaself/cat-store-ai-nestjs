import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { migrateDatabase } from '@llm-chatbot-nestjs/database';

@Injectable()
export class DatabaseService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await migrateDatabase(this.dataSource);
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
