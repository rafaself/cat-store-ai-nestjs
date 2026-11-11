import { Test, type TestingModule } from '@nestjs/testing';
import { DRAFT_EMAIL_JOB } from '@cat-supplies-store/contracts';
import { createEmailJobId } from '@cat-supplies-store/contracts/email-job-id';
import type { Job } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailProcessor } from './email.processor';
import { EmailDraftsRepository } from './email-drafts.repository';
import { EMAIL_SOURCE } from './email-source';
import { TriageService } from './triage.service';
import { RepliesService } from './replies.service';

const payload = { requesterId: 'demo-support', messageId: 'message_123' };
const jobInput = {
  name: DRAFT_EMAIL_JOB,
  data: payload,
  id: createEmailJobId(payload.requesterId, payload.messageId),
};
const job = jobInput as Job<unknown>;
const message = {
  id: payload.messageId,
  subject: 'Order help',
  sender: 'pat@example.test',
  senderName: 'Pat',
  text: 'My order is damaged.',
};
const classification = {
  category: 'order',
  orderId: 'ord_123',
  urgent: true,
  summary: 'Damaged order.',
};

describe('EmailProcessor', () => {
  let module: TestingModule;
  let processor: EmailProcessor;
  let drafts: {
    exists: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let source: { read: ReturnType<typeof vi.fn> };
  let triage: { triageEmail: ReturnType<typeof vi.fn> };
  let replies: { draftReply: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    drafts = {
      exists: vi.fn().mockResolvedValue(false),
      save: vi.fn().mockResolvedValue(undefined),
    };
    source = { read: vi.fn().mockResolvedValue(message) };
    triage = { triageEmail: vi.fn().mockResolvedValue(classification) };
    replies = { draftReply: vi.fn().mockResolvedValue('We can help.') };
    module = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        { provide: EmailDraftsRepository, useValue: drafts },
        { provide: EMAIL_SOURCE, useValue: source },
        { provide: TriageService, useValue: triage },
        { provide: RepliesService, useValue: replies },
      ],
    }).compile();
    processor = module.get(EmailProcessor);
  });

  afterEach(async () => {
    await module?.close();
  });

  it('skips source and AI calls when the draft already exists', async () => {
    drafts.exists.mockResolvedValue(true);
    await processor.process(job);
    expect(source.read).not.toHaveBeenCalled();
    expect(triage.triageEmail).not.toHaveBeenCalled();
    expect(replies.draftReply).not.toHaveBeenCalled();
    expect(drafts.save).not.toHaveBeenCalled();
  });

  it('persists the classified draft under the validated requester and message identity', async () => {
    await processor.process(job);
    expect(source.read).toHaveBeenCalledWith(payload.messageId);
    expect(triage.triageEmail).toHaveBeenCalledWith(message.text);
    expect(replies.draftReply).toHaveBeenCalledWith(
      message.text,
      message.senderName,
    );
    expect(drafts.save).toHaveBeenCalledWith({
      jobId: job.id,
      ...payload,
      subject: message.subject,
      sender: message.sender,
      classification,
      draft: 'We can help.',
    });
  });

  it.each(['lookup', 'source', 'triage', 'reply', 'save'])(
    'keeps private %s failures out of the persisted queue error',
    async (failure) => {
      const operation = {
        lookup: drafts.exists,
        source: source.read,
        triage: triage.triageEmail,
        reply: replies.draftReply,
        save: drafts.save,
      }[failure]!;
      operation.mockRejectedValue(
        new Error('Private message, credentials, or database details'),
      );
      await expect(processor.process(job)).rejects.toThrow(
        new Error('Email job processing failed.'),
      );
    },
  );

  it('rejects a mismatched queue identity before any I/O or AI calls', async () => {
    await expect(
      processor.process({ ...jobInput, id: '0'.repeat(64) } as Job<unknown>),
    ).rejects.toThrow('Invalid email job identity.');
    expect(drafts.exists).not.toHaveBeenCalled();
    expect(source.read).not.toHaveBeenCalled();
    expect(triage.triageEmail).not.toHaveBeenCalled();
    expect(replies.draftReply).not.toHaveBeenCalled();
  });
});
