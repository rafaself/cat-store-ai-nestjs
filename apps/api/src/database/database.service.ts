import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseService {
  constructor(private readonly dataSource: DataSource) {}

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
