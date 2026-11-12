import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createAiConfig, loadAiConfig } from '@cat-supplies-store/ai';
import {
  readEnvironment,
  validateEnvironment,
  loadQueueConfig,
} from '@cat-supplies-store/config';
import { describe, expect, it } from 'vitest';
import { createDatabaseConfig } from '../database/database.config';
import { createQueueConfig } from './queue.config';
import { createWorkflowsConfig } from '@cat-supplies-store/workflow-storage';

describe('configuration without environment mutations', () => {
  it('uses file settings, gives ambient values precedence, and leaves process.env unchanged', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'chatbot-config-'));
    const envFile = join(directory, '.env');
    const before = { ...process.env };
    try {
      writeFileSync(
        envFile,
        [
          'DATABASE_URL=postgresql://test:test@file-host:5432/file-db',
          'AWS_REGION=us-west-2',
          'AWS_BEARER_TOKEN_BEDROCK=file-token',
          'ANTHROPIC_API_KEY=file-anthropic-key',
          'OPENAI_API_KEY=file-openai-key',
          'REDIS_PORT=17379',
          'NODE_ENV=production',
          'LOG_LEVEL=error',
          'WORKFLOWS_ENCRYPTION_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
        ].join('\n'),
      );
      const environment = readEnvironment(envFile, {
        AWS_REGION: 'eu-west-1',
      });
      const config = validateEnvironment(environment);
      const database = createDatabaseConfig(config.database);
      const ai = createAiConfig(loadAiConfig(environment));
      const queue = createQueueConfig(loadQueueConfig(environment));
      const workflows = createWorkflowsConfig(config.workflows);
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            validate: () => config,
            load: [database, ai, queue, workflows],
          }),
        ],
      }).compile();
      try {
        expect(module.get(database.KEY)).toMatchObject({
          connectionString: 'postgresql://test:test@file-host:5432/file-db',
        });
        expect(module.get(ai.KEY)).toMatchObject({
          providers: {
            bedrock: { region: 'eu-west-1', apiKey: 'file-token' },
            anthropic: undefined,
            openai: undefined,
          },
          models: {
            default: { provider: 'bedrock', modelId: 'us.openai.gpt-6-luna' },
          },
          embeddingModels: {
            default: {
              provider: 'bedrock',
              modelId: 'amazon.titan-embed-text-v2:0',
            },
          },
        });
        expect(module.get(queue.KEY)).toMatchObject({ port: 17379 });
        expect(module.get(ConfigService).get('workflows.encryptionKey')).toBe(
          'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
        );
        expect(module.get(ConfigService).get('logger')).toEqual({
          json: true,
          colors: false,
          logLevels: ['error', 'fatal'],
        });
        expect(process.env).toEqual(before);
      } finally {
        await module.close();
      }
      expect(
        readEnvironment(join(directory, 'missing'), { VALUE: 'ambient' }),
      ).toEqual({ VALUE: 'ambient' });
      expect(process.env).toEqual(before);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
