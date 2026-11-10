import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DatabaseConfig } from '@llm-chatbot-nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class WorkflowPool extends Pool implements OnApplicationShutdown {
  constructor(config: ConfigService) {
    const options = config.getOrThrow<DatabaseConfig>('database');
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
