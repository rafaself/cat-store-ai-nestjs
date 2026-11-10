import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports that the application is healthy', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
