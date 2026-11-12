import { loadLoggerConfig, type LoggerConfig } from './logger.js';
import { loadApiConfig, type ApiConfig } from './api.js';
import { loadAuthConfig, type AuthConfig } from './auth.js';
import { loadBedrockConfig, type BedrockConfig } from './bedrock.js';
import { loadDatabaseConfig, type DatabaseConfig } from './database.js';
import { loadWorkflowConfig, type WorkflowConfig } from './workflows.js';

export interface RuntimeConfig {
  api: ApiConfig;
  logger: LoggerConfig;
  auth: AuthConfig;
  bedrock: BedrockConfig;
  database: DatabaseConfig;
  workflows: WorkflowConfig;
}

export function validateEnvironment(env: NodeJS.ProcessEnv): RuntimeConfig {
  return {
    api: loadApiConfig(env),
    logger: loadLoggerConfig(env),
    auth: loadAuthConfig(env),
    bedrock: loadBedrockConfig(env),
    database: loadDatabaseConfig(env),
    workflows: loadWorkflowConfig(env),
  };
}
