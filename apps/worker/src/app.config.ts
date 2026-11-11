import { resolve } from 'node:path';
import {
  readEnvironment,
  loadBedrockConfig,
  loadDatabaseConfig,
  loadQueueConfig,
  loadMailpitConfig,
} from '@cat-supplies-store/config';
import { createBedrockConfig } from '@cat-supplies-store/ai';
import { createWorkerConfig } from './config/worker.config';

const environment = readEnvironment(resolve(__dirname, '../../../.env'));
export const bedrockConfig = createBedrockConfig(
  loadBedrockConfig(environment),
);
export const workerConfig = createWorkerConfig({
  database: loadDatabaseConfig(environment),
  queue: loadQueueConfig(environment),
  mailpit: loadMailpitConfig(environment),
});

export const appConfigOptions = {
  isGlobal: true,
  ignoreEnvFile: true,
  // Named factories use parsed settings without copying values into process.env.
  validate: () => ({}),
  load: [bedrockConfig, workerConfig],
};
