import { EntityManager } from 'typeorm';

export class RepositoryDatabase {
  constructor(private readonly manager: EntityManager) {}

  async query<Row = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }> {
    const result = await this.manager.query(sql, values);
    return {
      rows: (Array.isArray(result[0]) && typeof result[1] === 'number'
        ? result[0]
        : result) as Row[],
    };
  }

  transaction<T>(work: (client: RepositoryDatabase) => Promise<T>): Promise<T> {
    return this.manager.transaction((manager) =>
      work(new RepositoryDatabase(manager)),
    );
  }
}
