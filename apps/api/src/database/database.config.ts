import { registerAs } from '@nestjs/config';
import {
  loadDatabaseConfig,
  type DatabaseConfig,
  type Environment,
} from '@cat-supplies-store/config';
import { databaseOptions } from '@cat-supplies-store/database';
import * as pg from 'pg';

export const createDatabaseConfig = (environment: Environment) =>
  registerAs('database', () => loadDatabaseConfig(environment));

export function buildDatabaseOptions(config: DatabaseConfig) {
  return { ...databaseOptions(config), driver: pg };
}
