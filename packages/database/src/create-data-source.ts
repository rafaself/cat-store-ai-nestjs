import { DataSource, type DataSourceOptions } from 'typeorm';
import { migrateDatabase } from './migrate.js';

export async function createMigratedDataSource(
  options?: DataSourceOptions,
): Promise<DataSource> {
  if (!options) throw new Error('Database options are required.');
  const dataSource = await new DataSource(options).initialize();
  try {
    await migrateDatabase(dataSource);
    return dataSource;
  } catch (error) {
    await dataSource.destroy();
    throw error;
  }
}
