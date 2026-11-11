import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { EMAIL_QUEUE } from '@cat-supplies-store/contracts';
import { createEmailJobId } from '@cat-supplies-store/contracts/email-job-id';
import { describe, expect, it, vi } from 'vitest';
import { EmailJobDraftsRepository } from './email-job-drafts.repository';
import { EmailJobsService } from './email-jobs.service';

const messageId = 'message-123';
const jobId = createEmailJobId('demo-support', messageId);
const draft = {
  subject: 'Damaged order',
  sender: 'pat@example.test',
  classification: { category: 'order', urgent: true, summary: 'Damaged item.' },
  draft: 'We can help with your order.',
};

async function setup() {
  const queue = { add: vi.fn(), getJob: vi.fn() };
  const drafts = { findForRequester: vi.fn().mockResolvedValue(null) };
  const module = await Test.createTestingModule({
    providers: [
      EmailJobsService,
      { provide: getQueueToken(EMAIL_QUEUE), useValue: queue },
      { provide: EmailJobDraftsRepository, useValue: drafts },
    ],
  }).compile();
  return { service: module.get(EmailJobsService), queue, drafts };
}

describe('EmailJobsService', () => {
  it('does not enqueue another job when its draft is already persisted', async () => {
    const { service, queue, drafts } = await setup();
    drafts.findForRequester.mockResolvedValue(draft);

    await expect(service.create(messageId)).resolves.toEqual({ jobId });
    expect(drafts.findForRequester).toHaveBeenCalledWith(jobId, 'demo-support');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns a persisted draft after its queue job has been removed', async () => {
    const { service, queue, drafts } = await setup();
    drafts.findForRequester.mockResolvedValue(draft);

    await expect(service.get(jobId)).resolves.toEqual({
      jobId,
      status: 'completed',
      result: draft,
    });
    expect(queue.getJob).not.toHaveBeenCalled();
  });

  it.each([
    ['completed', 'completed'],
    ['failed', 'failed'],
    ['active', 'processing'],
    ['waiting', 'pending'],
    ['delayed', 'pending'],
  ])('reports queue state %s as %s', async (state, status) => {
    const { service, queue } = await setup();
    queue.getJob.mockResolvedValue({
      name: 'draft-email',
      data: { messageId, requesterId: 'demo-support' },
      getState: async () => state,
    });

    await expect(service.get(jobId)).resolves.toEqual({ jobId, status });
  });

  it.each([
    undefined,
    { name: 'draft-email', data: { requesterId: 'another-requester' } },
    { name: 'another-job', data: { requesterId: 'demo-support' } },
  ])('does not expose missing or unrelated jobs', async (job) => {
    const { service, queue } = await setup();
    queue.getJob.mockResolvedValue(job);

    await expect(service.get(jobId)).rejects.toThrow('Job not found.');
  });

  it('does not enqueue when checking for an existing draft fails', async () => {
    const { service, queue, drafts } = await setup();
    const failure = new Error('Database unavailable.');
    drafts.findForRequester.mockRejectedValue(failure);

    await expect(service.create(messageId)).rejects.toBe(failure);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
