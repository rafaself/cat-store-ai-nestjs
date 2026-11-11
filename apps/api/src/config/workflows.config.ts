import { registerAs } from '@nestjs/config';
import { AesGcmPayloadCodec } from '@nestjs/workflows';
import {
  loadWorkflowConfig,
  type WorkflowConfig,
  type Environment,
} from '@cat-supplies-store/config';

export const createWorkflowsConfig = (environment: Environment) =>
  registerAs('workflows', () => loadWorkflowConfig(environment));

export function buildWorkflowOptions(config: WorkflowConfig) {
  return {
    worker: config.worker,
    retry: config.retry,
    codec: new AesGcmPayloadCodec({
      keys: { local: config.encryptionKey },
      current: 'local',
    }),
  };
}
