import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { databaseOptions } from '@cat-supplies-store/database';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConversationRepository } from './conversation.repository';

// Load real entity metadata and QueryBuilder without opening a database connection.
// Only query execution is stubbed; PostgreSQL behavior is covered by integration tests.
class MetadataDataSource extends DataSource {
  prepare() {
    return this.buildMetadatas();
  }
}
const metadata = new MetadataDataSource(
  databaseOptions({ connectionString: 'postgresql://unused/unused' }),
);
beforeAll(async () => {
  await metadata.prepare();
});

function fixture() {
  const events: string[] = [];
  const client = Object.assign(new EventEmitter(), {
    end: vi.fn(async () => {
      events.push('close');
      client.emit('end');
    }),
  });
  const runner = {
    manager: undefined as unknown as QueryRunner['manager'],
    broadcaster: { broadcast: vi.fn(async () => {}) },
    isReleased: false,
    isTransactionActive: false,
    connect: vi.fn(async () => client),
    query: vi.fn(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) return [{ locked: true }];
      if (sql.includes('pg_advisory_unlock')) {
        events.push('unlock');
        return [{ unlocked: true }];
      }
      return [];
    }),
    startTransaction: vi.fn(async () => {
      runner.isTransactionActive = true;
    }),
    commitTransaction: vi.fn(async () => {
      runner.isTransactionActive = false;
    }),
    rollbackTransaction: vi.fn(async () => {
      events.push('rollback');
      runner.isTransactionActive = false;
    }),
    release: vi.fn(async () => {
      events.push('release');
      runner.isReleased = true;
    }),
  };
  runner.manager = metadata.createEntityManager(
    runner as unknown as QueryRunner,
  );
  const database = {
    getRepository: () => ({ existsBy: vi.fn(async () => true) }),
    createQueryRunner: () => runner,
  };
  const repository = new ConversationRepository(
    database as unknown as DataSource,
  );
  return { repository, runner, client, events };
}
afterEach(() => vi.restoreAllMocks());
describe('conversation session cleanup', () => {
  it('commits recovery before returning and unlocks exactly once before releasing', async () => {
    const f = fixture();
    const session = await f.repository.acquire('conversation', 'customer');
    expect(f.runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(f.runner.isTransactionActive).toBe(false);
    await Promise.all([session.release(), session.release()]);
    expect(f.events).toEqual(['unlock', 'release']);
    expect(f.client.end).not.toHaveBeenCalled();
    expect(f.client.listenerCount('end')).toBe(0);
  });
  it.each([false, new Error('unlock cancelled')])(
    'discards the physical client when unlock cannot be confirmed (%s)',
    async (outcome) => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      const f = fixture();
      const session = await f.repository.acquire('conversation', 'customer');
      f.runner.query.mockImplementationOnce(async () => {
        if (outcome instanceof Error) throw outcome;
        return [{ unlocked: false }];
      });
      await expect(session.release()).rejects.toThrow();
      expect(f.events).toEqual(['close', 'release']);
    },
  );
  it('rolls back failed recovery and preserves its cause when rollback also fails', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const f = fixture();
    const original = new Error('recovery failed');
    f.runner.query.mockImplementation(async (sql) => {
      if (sql.includes('pg_try_advisory_lock')) return [{ locked: true }];
      throw original;
    });
    f.runner.rollbackTransaction.mockRejectedValue(
      new Error('rollback failed'),
    );
    await expect(f.repository.acquire('conversation', 'customer')).rejects.toBe(
      original,
    );
    expect(f.client.end).toHaveBeenCalledTimes(1);
    expect(f.runner.release).toHaveBeenCalledTimes(1);
  });
  it('closes a connection when lock acquisition has an uncertain outcome', async () => {
    const f = fixture();
    const error = new Error('acquisition cancelled');
    f.runner.query.mockRejectedValueOnce(error);
    await expect(f.repository.acquire('conversation', 'customer')).rejects.toBe(
      error,
    );
    expect(f.events).toEqual(['close', 'release']);
  });
  it('returns a healthy connection normally when another session owns the lock', async () => {
    const f = fixture();
    f.runner.query.mockResolvedValueOnce([{ locked: false }]);
    await expect(
      f.repository.acquire('conversation', 'customer'),
    ).rejects.toThrow('already active');
    expect(f.client.end).not.toHaveBeenCalled();
    expect(f.events).toEqual(['release']);
  });
  it('aborts execution on session loss and refuses subsequent tool operations', async () => {
    const f = fixture();
    const session = await f.repository.acquire('conversation', 'customer');
    f.client.emit('error', new Error('connection lost'));
    expect(session.signal.aborted).toBe(true);
    const operation = vi.fn();
    await expect(
      f.repository.executeTool(
        session,
        'turn',
        'call',
        'find-order',
        {},
        operation,
      ),
    ).rejects.toThrow('session ended');
    expect(operation).not.toHaveBeenCalled();
    await session.release();
  });
});
