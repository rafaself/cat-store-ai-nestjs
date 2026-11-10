import { registerAs } from '@nestjs/config';
import {
  loadDatabaseConfig,
  type DatabaseConfig,
  type Environment,
} from '@llm-chatbot-nestjs/config';
import { databaseOptions } from '@llm-chatbot-nestjs/database';
import * as pg from 'pg';

export const createDatabaseConfig = (environment: Environment) =>
  registerAs('database', () => loadDatabaseConfig(environment));

export function buildDatabaseOptions(config: DatabaseConfig) {
  return { ...databaseOptions(config), driver: pg };
}
