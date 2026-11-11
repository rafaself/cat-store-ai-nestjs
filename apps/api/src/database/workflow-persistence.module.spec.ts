import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { WorkflowsModule, WorkflowWorker } from '@nestjs/workflows';
import { PostgresWorkflowStore } from '@nestjs/workflows/postgres';
import { WORKFLOW_DATABASE_POOL } from '@cat-supplies-store/workflow-storage';
import { loadDatabaseConfig } from '@cat-supplies-store/config';
import { describe, expect, it, vi } from 'vitest';
import { createDatabaseConfig } from './database.config';
import { WorkflowPersistenceModule } from './workflow-persistence.module';
import { WorkflowPool } from './workflow-pool';

describe('workflow persistence lifecycle', () => {
  it('shares one configured pool and stops the worker before closing it', async () => {
    const config = loadDatabaseConfig({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/lifecycle',
    });
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: () => ({}),
          load: [createDatabaseConfig(config)],
        }),
        WorkflowsModule.forRoot({ worker: false, allowInMemoryStorage: true }),
        WorkflowPersistenceModule,
      ],
    })
      // Exercise Nest lifecycle ordering without requiring a PostgreSQL server.
      .overrideProvider(PostgresWorkflowStore)
      .useValue({})
      .compile();
    const pool = module.get(WorkflowPool);
    expect(module.get(WORKFLOW_DATABASE_POOL)).toBe(pool);
    expect(pool.options.connectionString).toBe(config.connectionString);
    const events: string[] = [];
    const worker = module.get(WorkflowWorker);
    const stopWorker = worker.onModuleDestroy.bind(worker);
    vi.spyOn(worker, 'onModuleDestroy').mockImplementation(async () => {
      await stopWorker();
      events.push('worker stopped');
    });
    const endPool = pool.end.bind(pool);
    const end = vi.spyOn(pool, 'end').mockImplementation(async () => {
      events.push('pool closed');
      await endPool();
    });
    try {
      await module.init();
    } finally {
      await module.close();
    }
    expect(events).toEqual(['worker stopped', 'pool closed']);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
