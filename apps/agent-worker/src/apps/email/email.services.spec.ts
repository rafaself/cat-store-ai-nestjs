import { AiModule } from '@nestjs/ai';
import { FakeModel } from '@nestjs/ai/testing';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RepliesService } from './replies.service';
import { TriageService } from './triage.service';

describe('email AI services', () => {
  it('classifies mail and drafts a reply with a fake model', async () => {
    const model = new FakeModel([
      {
        object: {
          category: 'order',
          orderId: 'ord_123',
          urgent: true,
          summary: 'The package arrived damaged.',
        },
      },
      { text: 'We are sorry the package arrived damaged. We can help.' },
    ]);
    const builder = Test.createTestingModule({
      imports: [
        AiModule.forRoot({
          isGlobal: true,
          models: { default: model },
        }),
      ],
      providers: [TriageService, RepliesService],
    });
    const module = await builder.compile();

    await expect(
      module
        .get(TriageService)
        .triageEmail('My package arrived damaged, order ord_123.'),
    ).resolves.toMatchObject({
      category: 'order',
      orderId: 'ord_123',
      urgent: true,
    });

    await expect(
      module
        .get(RepliesService)
        .draftReply('My package arrived damaged.', 'Pat'),
    ).resolves.toContain('sorry');

    expect(model.calls).toHaveLength(2);

    await module.close();
  });
});
