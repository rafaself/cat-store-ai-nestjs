import { getConfigToken, registerAs } from '@nestjs/config';
import { type DatabaseConfig } from '@cat-supplies-store/config';
import { databaseOptions } from '@cat-supplies-store/database';
import * as pg from 'pg';

export const databaseConfigKey = getConfigToken('database');

export const createDatabaseConfig = (config: DatabaseConfig) =>
  registerAs('database', () => config);

export function buildDatabaseOptions(config: DatabaseConfig) {
  return { ...databaseOptions(config), driver: pg };
}
