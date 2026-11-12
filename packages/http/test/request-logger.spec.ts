import {
  Controller,
  Get,
  Injectable,
  Logger,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestLogger } from '../src/request-logger.js';

@Injectable()
class RejectRequest implements CanActivate {
  canActivate(): boolean {
    throw new UnauthorizedException();
  }
}

let streamResponse: Response | undefined;

@Controller()
class TestController {
  @Post('messages/:id')
  message() {
    return { text: 'private response' };
  }

  @Get('protected')
  @UseGuards(RejectRequest)
  protected() {
    return 'unreachable';
  }

  @Get('error')
  error() {
    throw new Error('private error details');
  }

  @Get('stream')
  stream(@Res() response: Response) {
    streamResponse = response;
    response.type('text/plain').write('first chunk');
  }

  @Get('pending')
  pending(@Res() response: Response) {
    streamResponse = response;
  }
}

describe('requestLogger', () => {
  let app: NestExpressApplication;
  let origin: string;
  const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  const error = vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => {});

  function entries() {
    return [log, warn, error].flatMap((spy) =>
      spy.mock.calls.filter(([message]) =>
        String(message).startsWith('HTTP request '),
      ),
    );
  }

  beforeEach(async () => {
    streamResponse = undefined;
    const module = await Test.createTestingModule({
      controllers: [TestController],
      providers: [RejectRequest],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    app.use(requestLogger);
    app.useBodyParser('json', { limit: '1kb' });
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    streamResponse?.destroy();
    await app.close();
  });

  it('logs metadata once, excluding secrets and user-controlled identifiers', async () => {
    const response = await fetch(`${origin}/messages/private-id?token=secret`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer secret',
        cookie: 'session=secret',
        'x-request-id': 'forged-id',
      },
      body: JSON.stringify({ text: 'private message', requestId: 'client-id' }),
    });
    expect(response.status).toBe(201);
    await response.text();
    const requestId = response.headers.get('x-request-id');
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(entries()).toEqual([
      [
        'HTTP request completed',
        {
          requestId,
          method: 'POST',
          route: '/messages/:id',
          statusCode: 201,
          durationMs: expect.any(Number),
          outcome: 'completed',
        },
      ],
    ]);
    expect(log).toHaveBeenCalledOnce();
    expect(entries()[0][1].durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(entries())).not.toMatch(
      /secret|private|forged|client-id/,
    );
  });

  it.each([
    ['/protected', 401, '/protected'],
    ['/unknown/private-id?token=secret', 404, '<unmatched>'],
  ])(
    'logs rejected requests at warn level: %s',
    async (path, status, route) => {
      const response = await fetch(`${origin}${path}`);
      expect(response.status).toBe(status);
      await response.text();
      expect(warn).toHaveBeenCalledWith(
        'HTTP request completed',
        expect.objectContaining({ statusCode: status, route }),
      );
      expect(entries()).toHaveLength(1);
    },
  );

  it.each([
    ['{"secret":', 400],
    [JSON.stringify({ secret: 'x'.repeat(1024) }), 413],
  ])(
    'logs body-parser rejections without logging their input %#',
    async (body, status) => {
      const response = await fetch(`${origin}/messages/private-id`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(response.status).toBe(status);
      await response.text();
      expect(warn).toHaveBeenCalledWith(
        'HTTP request completed',
        expect.objectContaining({ statusCode: status, route: '<unmatched>' }),
      );
      expect(entries()).toHaveLength(1);
      expect(JSON.stringify(entries())).not.toMatch(/secret|private-id/);
    },
  );

  it('logs server failures at error level without error details', async () => {
    const response = await fetch(`${origin}/error`);
    expect(response.status).toBe(500);
    await response.text();
    expect(error).toHaveBeenCalledWith(
      'HTTP request completed',
      expect.objectContaining({ statusCode: 500, outcome: 'completed' }),
    );
    expect(entries()).toHaveLength(1);
    expect(JSON.stringify(entries())).not.toContain('private error details');
  });

  it('waits for streaming completion and leaves chunks intact', async () => {
    const response = await fetch(`${origin}/stream`);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(
      'first chunk',
    );
    expect(entries()).toHaveLength(0);
    streamResponse!.end('last chunk');
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(
      'last chunk',
    );
    expect((await reader.read()).done).toBe(true);
    await vi.waitFor(() => expect(entries()).toHaveLength(1));
    expect(log).toHaveBeenCalledWith(
      'HTTP request completed',
      expect.objectContaining({ route: '/stream', statusCode: 200 }),
    );
  });

  it('records a disconnected stream once as aborted', async () => {
    const abort = new AbortController();
    const response = await fetch(`${origin}/stream`, { signal: abort.signal });
    await response.body!.getReader().read();
    abort.abort();
    await vi.waitFor(() => expect(entries()).toHaveLength(1));
    expect(warn).toHaveBeenCalledWith(
      'HTTP request aborted',
      expect.objectContaining({ statusCode: 200, outcome: 'aborted' }),
    );
    expect(log).not.toHaveBeenCalled();
  });

  it('does not claim a successful status if disconnected before response headers', async () => {
    const abort = new AbortController();
    const response = fetch(`${origin}/pending`, { signal: abort.signal });
    const rejected = expect(response).rejects.toThrow();
    await vi.waitFor(() => expect(streamResponse).toBeDefined());
    abort.abort();
    await rejected;
    await vi.waitFor(() => expect(entries()).toHaveLength(1));
    expect(warn).toHaveBeenCalledWith(
      'HTTP request aborted',
      expect.objectContaining({ statusCode: null, outcome: 'aborted' }),
    );
  });

  it('generates independent request IDs for concurrent requests', async () => {
    const responses = await Promise.all([
      fetch(`${origin}/protected`),
      fetch(`${origin}/protected`),
    ]);
    await Promise.all(responses.map((response) => response.text()));
    expect(
      new Set(responses.map((response) => response.headers.get('x-request-id')))
        .size,
    ).toBe(2);
    expect(entries()).toHaveLength(2);
  });
});
