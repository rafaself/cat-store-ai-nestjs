import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { databaseConfigKey } from './database.config';
import type { DatabaseConfig } from '@cat-supplies-store/config';
import { Pool } from 'pg';

@Injectable()
export class WorkflowPool extends Pool implements OnApplicationShutdown {
  constructor(@Inject(databaseConfigKey) options: DatabaseConfig) {
    super({
      connectionString: options.connectionString,
      max: options.max,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
    });
  }
  async onApplicationShutdown(): Promise<void> {
    await this.end();
  }
}
