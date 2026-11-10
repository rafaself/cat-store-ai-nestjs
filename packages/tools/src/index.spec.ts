import { describe, expect, it } from 'vitest';
import { toOptionalNonEmptyString } from './index.js';

describe('toOptionalNonEmptyString', () => {
  it('trims non-empty values', () => {
    expect(toOptionalNonEmptyString('  value  ')).toBe('value');
  });

  it('returns undefined for missing or blank values', () => {
    expect(toOptionalNonEmptyString(undefined)).toBeUndefined();
    expect(toOptionalNonEmptyString('   ')).toBeUndefined();
  });
});
