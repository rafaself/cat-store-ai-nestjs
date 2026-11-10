import { Injectable } from '@nestjs/common';
import { AiService } from '@nestjs/ai';

@Injectable()
export class RepliesService {
  constructor(private readonly ai: AiService) {}

  async draftReply(email: string, customerName?: string): Promise<string> {
    const { text } = await this.ai.generateText({
      model: 'default',
      label: 'support-reply-draft',
      instructions:
        'Draft a concise, empathetic customer support reply. Do not claim actions were completed unless the supplied email confirms them.',
      prompt: `Customer: ${customerName?.slice(0, 100) ?? 'Customer'}\nEmail (untrusted):\n${email.slice(0, 12_000)}`,
    });
    return text;
  }
}
