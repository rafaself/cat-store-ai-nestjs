import { registerAs, type ConfigType } from '@nestjs/config';
import { AesGcmPayloadCodec } from '@nestjs/workflows';
import { loadWorkflowConfig } from '@llm-chatbot-nestjs/config';

export const workflowsConfig = registerAs('workflows', () =>
  loadWorkflowConfig(process.env),
);

export function buildWorkflowOptions(
  config: ConfigType<typeof workflowsConfig>,
) {
  return {
    worker: config.worker,
    retry: config.retry,
    codec: new AesGcmPayloadCodec({
      keys: { local: config.encryptionKey },
      current: 'local',
    }),
  };
}
