import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AssistantController } from './assistant.controller';
import type { AssistantService } from './assistant.service';

describe('AssistantController cancellation', () => {
  it.each([false, true])(
    'aborts on disconnect only while the response is unfinished (%s)',
    async (writableEnded) => {
      const response = Object.assign(new EventEmitter(), { writableEnded });
      const stream = {
        abort: vi.fn(),
        pipeUIMessageStreamToResponse: vi.fn().mockResolvedValue(undefined),
      };
      const service = { stream: vi.fn().mockReturnValue(stream) };
      const controller = new AssistantController(
        service as unknown as AssistantService,
      );
      await controller.chat(
        {
          messages: [
            {
              id: 'one',
              role: 'user',
              parts: [{ type: 'text', text: 'Hello' }],
            },
          ],
        },
        {} as Request,
        response as unknown as Response,
      );
      response.emit('close');
      expect(stream.abort).toHaveBeenCalledTimes(writableEnded ? 0 : 1);
      expect(stream.pipeUIMessageStreamToResponse).toHaveBeenCalledWith(
        response,
        expect.objectContaining({ errorText: expect.any(Function) }),
      );
    },
  );
});
