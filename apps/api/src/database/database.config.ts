import { registerAs, type ConfigType } from '@nestjs/config';
import { loadDatabaseConfig } from '@llm-chatbot-nestjs/config';
import { databaseOptions } from '@llm-chatbot-nestjs/database';
import * as pg from 'pg';

export const databaseConfig = registerAs('database', () =>
  loadDatabaseConfig(process.env),
);

export function buildDatabaseOptions(
  config: ConfigType<typeof databaseConfig>,
) {
  return { ...databaseOptions(config), driver: pg };
}
