import { resolve } from 'node:path';
import {
  readEnvironment,
  loadApiConfig,
  loadLoggerConfig,
  loadDatabaseConfig,
} from '@cat-supplies-store/config';
import { createAiConfig, loadAiConfig } from '@cat-supplies-store/ai';
import { loadAgentApiConfig } from './config/agent-api.config';

const environment = readEnvironment(resolve(__dirname, '../../../.env'));
const agent = loadAgentApiConfig(environment);

export const aiConfig = createAiConfig(loadAiConfig(environment));
export const appConfigOptions = {
  isGlobal: true,
  ignoreEnvFile: true,
  validate: () => ({
    api: loadApiConfig({ ...environment, PORT: agent.port }),
    logger: loadLoggerConfig(environment),
    database: loadDatabaseConfig(environment),
    businessApi: { url: agent.businessApiUrl },
  }),
  load: [aiConfig],
};
