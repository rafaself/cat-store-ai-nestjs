import { resolve } from 'node:path';
import {
  readEnvironment,
  validateEnvironment,
  loadQueueConfig,
} from '@cat-supplies-store/config';
import { createBedrockConfig } from '@cat-supplies-store/ai';
import { createDatabaseConfig } from './database/database.config';
import { createQueueConfig } from './config/queue.config';
import { createWorkflowsConfig } from './config/workflows.config';

const environment = readEnvironment(resolve(__dirname, '../../../.env'));
const config = validateEnvironment(environment);

export const databaseConfig = createDatabaseConfig(config.database);
export const bedrockConfig = createBedrockConfig(config.bedrock);
export const workflowsConfig = createWorkflowsConfig(config.workflows);
export const queueConfig = createQueueConfig(loadQueueConfig(environment));

export const appConfigOptions = {
  isGlobal: true,
  ignoreEnvFile: true,
  validate: () => config,
  load: [databaseConfig, bedrockConfig, workflowsConfig, queueConfig],
};
