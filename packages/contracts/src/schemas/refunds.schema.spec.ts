import { describe, expect, it } from 'vitest';
import { refundDecisionSchema } from './refunds.schema.js';

describe('refundDecisionSchema', () => {
  it('requires a nonblank reason for rejection', () => {
    expect(refundDecisionSchema.safeParse({ approved: false }).success).toBe(
      false,
    );

    expect(
      refundDecisionSchema.safeParse({ approved: false, reason: '  ' }).success,
    ).toBe(false);

    expect(
      refundDecisionSchema.parse({
        approved: false,
        reason: '  not eligible  ',
      }),
    ).toEqual({ approved: false, reason: 'not eligible' });

    expect(refundDecisionSchema.parse({ approved: true })).toEqual({
      approved: true,
    });
  });
});
