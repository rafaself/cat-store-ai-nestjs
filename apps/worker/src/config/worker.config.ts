import { getConfigToken, registerAs } from '@nestjs/config';
import {
  loadDatabaseConfig,
  loadMailpitConfig,
  loadQueueConfig,
  type Environment,
} from '@cat-supplies-store/config';
import { databaseOptions } from '@cat-supplies-store/database';
import * as pg from 'pg';

export const workerConfigKey = getConfigToken('worker');
export const createWorkerConfig = (environment: Environment) =>
  registerAs('worker', () => ({
    database: loadDatabaseConfig(environment),
    queue: loadQueueConfig(environment),
    mailpit: loadMailpitConfig(environment),
  }));
export type WorkerConfig = ReturnType<ReturnType<typeof createWorkerConfig>>;
export function buildWorkerDatabaseOptions(config: WorkerConfig) {
  return { ...databaseOptions(config.database), driver: pg };
}
export function buildWorkerQueueOptions(config: WorkerConfig) {
  return { connection: { ...config.queue, maxRetriesPerRequest: null } };
}
