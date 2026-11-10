import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { AiModule } from '@nestjs/ai';
import { FakeModel, overrideModels } from '@nestjs/ai/testing';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { SupportModule } from './support.module';
import { InvoicesService } from './invoices.service';
import { RepliesService } from './replies.service';
import { TriageService } from './triage.service';

describe('SupportModule AI services', () => {
  it('returns typed triage and invoice data and drafts a reply without network calls', async () => {
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
      {
        object: {
          vendor: 'Feline Supplies',
          invoiceNumber: 'INV-8842',
          dueDate: '2026-12-15',
          currency: 'USD',
          total: 128.5,
        },
      },
    ]);
    const builder = Test.createTestingModule({
      imports: [
        AiModule.forRoot({
          isGlobal: true,
          models: { default: amazonBedrock('us.openai.gpt-6-luna') },
        }),
        SupportModule,
      ],
    });
    const module = await overrideModels(builder, { default: model }).compile();

    await expect(
      module
        .get(TriageService)
        .triageEmail('My package arrived damaged, order ord_123.'),
    ).resolves.toEqual({
      category: 'order',
      orderId: 'ord_123',
      urgent: true,
      summary: 'The package arrived damaged.',
    });
    await expect(
      module
        .get(RepliesService)
        .draftReply('My package arrived damaged.', 'Pat'),
    ).resolves.toContain('sorry');
    await expect(
      module
        .get(InvoicesService)
        .extractInvoice(
          'Feline Supplies INV-8842 due 2026-12-15 total USD 128.50',
        ),
    ).resolves.toMatchObject({
      invoiceNumber: 'INV-8842',
      dueDate: '2026-12-15',
      total: 128.5,
    });
    expect(model.calls).toHaveLength(3);

    await module.close();
  });
});
