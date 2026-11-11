import { Module } from '@nestjs/common';
import {
  postgresWorkflowStoreProvider,
  WORKFLOW_DATABASE_POOL,
} from '@cat-supplies-store/workflow-storage';
import { WorkflowPool } from './workflow-pool';

@Module({
  providers: [
    WorkflowPool,
    { provide: WORKFLOW_DATABASE_POOL, useExisting: WorkflowPool },
    postgresWorkflowStoreProvider,
  ],
})
export class WorkflowPersistenceModule {}
