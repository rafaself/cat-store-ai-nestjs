import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HttpRequest');

export function requestLogger(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const startedAt = performance.now();
  const requestId = randomUUID();
  response.setHeader('X-Request-Id', requestId);

  function logRequest() {
    response.off('finish', logRequest);
    response.off('close', logRequest);

    const completed = response.writableFinished;
    // Route patterns exclude user-controlled path parameters and query strings.
    const route = request.route?.path as unknown;
    const fields = {
      requestId,
      method: request.method,
      route: typeof route === 'string' ? route : '<unmatched>',
      statusCode: response.headersSent ? response.statusCode : null,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      outcome: completed ? 'completed' : 'aborted',
    };
    const message = `HTTP request ${fields.outcome}`;

    if (response.statusCode >= 500) {
      logger.error(message, fields);
    } else if (!completed || response.statusCode >= 400) {
      logger.warn(message, fields);
    } else {
      logger.log(message, fields);
    }
  }

  response.once('finish', logRequest);
  response.once('close', logRequest);
  next();
}
