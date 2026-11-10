import { loadApiConfig, type ApiConfig } from './api.js';
import { loadAuthConfig, type AuthConfig } from './auth.js';
import { loadBedrockConfig, type BedrockConfig } from './bedrock.js';
import { loadDatabaseConfig, type DatabaseConfig } from './database.js';
import { loadWorkflowConfig, type WorkflowConfig } from './workflows.js';

export interface RuntimeConfig {
  api: ApiConfig;
  auth: AuthConfig;
  bedrock: BedrockConfig;
  database: DatabaseConfig;
  workflows: WorkflowConfig;
}

export function validateEnvironment(
  env: Record<string, unknown>,
): RuntimeConfig {
  return {
    api: loadApiConfig(env),
    auth: loadAuthConfig(env),
    bedrock: loadBedrockConfig(env),
    database: loadDatabaseConfig(env),
    workflows: loadWorkflowConfig(env),
  };
}
