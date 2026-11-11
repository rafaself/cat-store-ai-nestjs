import { registerAs } from '@nestjs/config';
import { AesGcmPayloadCodec } from '@nestjs/workflows';
import { type WorkflowConfig } from '@cat-supplies-store/config';

export const createWorkflowsConfig = (config: WorkflowConfig) =>
  registerAs('workflows', () => config);

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
