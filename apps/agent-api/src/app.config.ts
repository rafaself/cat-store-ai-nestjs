import { resolve } from 'node:path';
import {
  readEnvironment,
  loadApiConfig,
  loadLoggerConfig,
  loadBedrockConfig,
} from '@cat-supplies-store/config';
import { createBedrockConfig } from '@cat-supplies-store/ai';
import { loadAgentApiConfig } from './config/agent-api.config';

const environment = readEnvironment(resolve(__dirname, '../../../.env'));
const agent = loadAgentApiConfig(environment);
export const bedrockConfig = createBedrockConfig(
  loadBedrockConfig(environment),
);
export const appConfigOptions = {
  isGlobal: true,
  ignoreEnvFile: true,
  validate: () => ({
    api: loadApiConfig({ ...environment, PORT: agent.port }),
    logger: loadLoggerConfig(environment),
    businessApi: { url: agent.businessApiUrl },
  }),
  load: [bedrockConfig],
};
