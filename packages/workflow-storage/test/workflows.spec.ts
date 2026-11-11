import { describe, expect, it } from 'vitest';
import { loadWorkflowConfig } from '@cat-supplies-store/config';
import {
  buildWorkflowOptions,
  buildWorkflowClientOptions,
} from '../src/workflows.config.js';

const key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

describe('workflow execution roles', () => {
  it('disables execution in the API and enables it in the worker with the same retry policy', () => {
    const config = loadWorkflowConfig({ WORKFLOWS_ENCRYPTION_KEY: key });
    const client = buildWorkflowClientOptions(config);
    const worker = buildWorkflowOptions(config);
    expect(client.worker).toBe(false);
    expect(worker.worker).toEqual({ concurrency: 4, pollInterval: '1s' });
    expect(client.retry).toEqual(worker.retry);
  });
});
