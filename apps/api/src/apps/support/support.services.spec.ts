import { AiModule } from '@nestjs/ai';
import { FakeModel } from '@nestjs/ai/testing';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { SupportModule } from './support.module';
import { InvoicesService } from './invoices.service';

describe('SupportModule AI services', () => {
  it('extracts invoice data without network calls', async () => {
    const model = new FakeModel([
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
          models: { default: model },
        }),
        SupportModule,
      ],
    });
    const module = await builder.compile();

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
    expect(model.calls).toHaveLength(1);

    await module.close();
  });
});
