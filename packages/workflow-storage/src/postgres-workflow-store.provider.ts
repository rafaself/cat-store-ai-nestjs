import type { Provider } from '@nestjs/common';
import { WorkflowStorage } from '@nestjs/workflows';
import { PostgresWorkflowStore, fromPg } from '@nestjs/workflows/postgres';
import type { Pool } from 'pg';

export const WORKFLOW_DATABASE_POOL = Symbol('WORKFLOW_DATABASE_POOL');

export const postgresWorkflowStoreProvider: Provider = {
  provide: PostgresWorkflowStore,
  inject: [WORKFLOW_DATABASE_POOL, WorkflowStorage],
  useFactory: (pool: Pool, storage: WorkflowStorage) =>
    new PostgresWorkflowStore(
      { executor: fromPg(pool), migrate: true },
      storage,
    ),
};
