import { Module } from '@nestjs/common';
import {
  postgresWorkflowStoreProvider,
  WORKFLOW_DATABASE_POOL,
} from './postgres-workflow-store.provider.js';
import { WorkflowPool } from './workflow-pool.js';
import { ConfigurableModuleClass } from './workflow-persistence.definition.js';

@Module({
  providers: [
    WorkflowPool,
    { provide: WORKFLOW_DATABASE_POOL, useExisting: WorkflowPool },
    postgresWorkflowStoreProvider,
  ],
})
export class WorkflowPersistenceModule extends ConfigurableModuleClass {}
