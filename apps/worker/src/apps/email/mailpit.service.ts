import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { workerConfigKey, type WorkerConfig } from '../../config/worker.config';
import type { EmailSource } from './email-source';

const messageSchema = z.object({
  ID: z.string(),
  Subject: z.string().default(''),
  Text: z.string().nullable().optional(),
  From: z.object({ Address: z.string(), Name: z.string().optional() }),
});
const MAX_BYTES = 2 * 1024 * 1024;

@Injectable()
export class MailpitService implements EmailSource {
  constructor(@Inject(workerConfigKey) private readonly config: WorkerConfig) {}

  async read(messageId: string) {
    const base = this.config.mailpit.url.replace(/\/$/, '');

    const response = await fetch(
      `${base}/api/v1/message/${encodeURIComponent(messageId)}`,
      {
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok || !response.body)
      throw new Error(`Mailpit request failed (${response.status}).`);

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES)
          throw new Error('Mailpit message exceeds the size limit.');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }

    const message = messageSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString('utf8')),
    );

    if (message.ID !== messageId || !message.Text?.trim())
      throw new Error('Mailpit message has no usable plain-text body.');

    return {
      id: message.ID,
      subject: message.Subject.slice(0, 500),
      sender: message.From.Address.slice(0, 320),
      senderName: message.From.Name?.slice(0, 100),
      text: message.Text.slice(0, 12_000),
    };
  }
}
