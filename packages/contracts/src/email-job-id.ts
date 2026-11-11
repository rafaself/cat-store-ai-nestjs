import { createHash } from 'node:crypto';

// Persisted queue and draft identity: preserve the order and NUL separator.
// Keep this Node-only helper separate from the browser-safe schema exports.
export function createEmailJobId(
  requesterId: string,
  messageId: string,
): string {
  return createHash('sha256')
    .update(requesterId)
    .update('\0')
    .update(messageId)
    .digest('hex');
}
