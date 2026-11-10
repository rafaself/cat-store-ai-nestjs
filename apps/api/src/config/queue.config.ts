import { registerAs } from '@nestjs/config';
import { loadQueueConfig, type Environment } from '@llm-chatbot-nestjs/config';

export const createQueueConfig = (environment: Environment) =>
  registerAs('queue', () => loadQueueConfig(environment));
export function buildQueueOptions(config: ReturnType<typeof loadQueueConfig>) {
  return {
    connection: {
      ...config,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
  };
}
