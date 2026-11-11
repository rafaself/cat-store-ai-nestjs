import { describe, expect, it } from 'vitest';
import { createEmailJobId } from './email-job-id.js';

describe('persisted email job identity', () => {
  it.each([
    [
      'demo-support',
      'message_123',
      'd10f49446a06da6c2b2ede00eb800d8c6f889c27297da5d47ef119a605e3a43a',
    ],
    [
      'support-a',
      'message_123',
      '5b429808c49ecd2852bb8df66995de848b6b08df390ea1edbfea5f12b3b7ae9f',
    ],
    [
      'support-b',
      'message_123',
      'd4f922cea999b98b57695cfe0af67b686d5e828b28522bb84914f2e25d79f515',
    ],
    [
      'ab',
      'c',
      '6c032e631d39a14d85aff7e319546af701e26c97b57ca95fbfe9c6ba855f67bf',
    ],
    [
      'a',
      'bc',
      '40bb547d936bbd31318ee37ac8799e7ecbb22eda2651f65e3214bffb8ce97bb4',
    ],
  ])(
    'preserves the persisted ID for %s / %s',
    (requesterId, messageId, expected) => {
      expect(createEmailJobId(requesterId, messageId)).toBe(expected);
    },
  );
});
