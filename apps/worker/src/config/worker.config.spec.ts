import { describe, expect, it } from 'vitest';
import { createWorkerConfig, workerConfigKey } from './worker.config';

describe('worker configuration', () => {
  it('builds its settings from the supplied snapshot without changing process.env', () => {
    const before = { ...process.env };
    const config = createWorkerConfig({
      DATABASE_URL: 'postgresql://test:test@db:5432/jobs',
      REDIS_HOST: 'queue',
      REDIS_PORT: '6379',
      MAILPIT_URL: 'http://mailpit:8025',
    });
    expect(config.KEY).toBe(workerConfigKey);
    expect(config()).toMatchObject({
      database: { connectionString: 'postgresql://test:test@db:5432/jobs' },
      queue: { host: 'queue', port: 6379 },
      mailpit: { url: 'http://mailpit:8025' },
    });
    expect(process.env).toEqual(before);
  });
});
