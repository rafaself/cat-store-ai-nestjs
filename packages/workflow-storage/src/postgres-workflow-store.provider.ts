import type { Provider } from '@nestjs/common';
import { WorkflowStorage } from '@nestjs/workflows';
import { PostgresWorkflowStore, fromPg } from '@nestjs/workflows/postgres';
import { DATABASE_POOL, type DatabasePool } from '@llm-chatbot-nestjs/database';

export const postgresWorkflowStoreProvider: Provider = {
  provide: PostgresWorkflowStore,
  inject: [DATABASE_POOL, WorkflowStorage],
  useFactory: (pool: DatabasePool, storage: WorkflowStorage) =>
    new PostgresWorkflowStore(
      { executor: fromPg(pool), migrate: true },
      storage,
    ),
};
