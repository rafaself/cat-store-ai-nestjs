import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { loadLoggerConfig } from '@cat-supplies-store/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

const levels: LogLevel[] = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
];

afterEach(() => vi.restoreAllMocks());

describe('logger configuration', () => {
  it.each([
    ['development', 'debug', false],
    ['test', 'warn', false],
    ['production', 'log', true],
  ] as const)('defaults to %s logging', (environment, minimum, json) => {
    const config = loadLoggerConfig({ NODE_ENV: environment });
    expect(config.logLevels).toEqual(levels.slice(levels.indexOf(minimum)));
    expect(config.json).toBe(json);
    if (json) expect(config.colors).toBe(false);
  });

  it('defaults to development without mutating the supplied environment', () => {
    const environment = Object.freeze({});
    expect(loadLoggerConfig(environment)).toEqual({
      logLevels: ['debug', 'log', 'warn', 'error', 'fatal'],
      json: false,
    });
  });

  it.each(levels)('filters messages below %s', (minimum) => {
    const logger = new ConsoleLogger(loadLoggerConfig({ LOG_LEVEL: minimum }));
    for (const [index, level] of levels.entries()) {
      expect(logger.isLevelEnabled(level)).toBe(
        index >= levels.indexOf(minimum),
      );
    }
  });

  it.each(['info', 'invalid', '', 'DEBUG'])(
    'rejects unsupported level %j',
    (level) => {
      expect(() => loadLoggerConfig({ LOG_LEVEL: level })).toThrow('LOG_LEVEL');
    },
  );

  it('rejects unsupported environments', () => {
    expect(() => loadLoggerConfig({ NODE_ENV: 'staging' })).toThrow('NODE_ENV');
  });

  it('writes production messages as JSON without ANSI colors', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const logger = new ConsoleLogger(
      'LoggerTest',
      loadLoggerConfig({ NODE_ENV: 'production' }),
    );
    logger.log('Production message');
    const output = write.mock.calls
      .map(([message]) => String(message))
      .join('');
    expect(JSON.parse(output)).toMatchObject({
      level: 'log',
      message: 'Production message',
      context: 'LoggerTest',
    });
    expect(output).not.toContain('\u001b[');
  });

  it('writes development messages in readable text', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const logger = new ConsoleLogger(
      'LoggerTest',
      loadLoggerConfig({ NODE_ENV: 'development' }),
    );
    logger.debug('Development message');
    const output = write.mock.calls
      .map(([message]) => String(message))
      .join('');
    expect(output).toContain('Development message');
    expect(output).toContain('[LoggerTest]');
    expect(() => JSON.parse(output)).toThrow();
  });
});
