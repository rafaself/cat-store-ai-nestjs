import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { MODULE_OPTIONS_TOKEN } from './workflow-persistence.definition.js';
import type { PoolConfig } from 'pg';
import { Pool } from 'pg';

@Injectable()
export class WorkflowPool extends Pool implements OnApplicationShutdown {
  constructor(@Inject(MODULE_OPTIONS_TOKEN) options: PoolConfig) {
    super(options);
  }
  async onApplicationShutdown(): Promise<void> {
    await this.end();
  }
}
