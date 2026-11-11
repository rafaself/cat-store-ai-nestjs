import { registerAs } from '@nestjs/config';
import { loadQueueConfig } from '@cat-supplies-store/config';

export const createQueueConfig = (config: ReturnType<typeof loadQueueConfig>) =>
  registerAs('queue', () => config);

export function buildQueueOptions(config: ReturnType<typeof loadQueueConfig>) {
  return {
    connection: {
      ...config,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
  };
}
