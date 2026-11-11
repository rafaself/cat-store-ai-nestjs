import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  destroy: vi.fn(),
  migrate: vi.fn(),
}));
vi.mock('typeorm', () => ({
  DataSource: class {
    initialize = mocks.initialize;
    destroy = mocks.destroy;
  },
}));
vi.mock('./migrate.js', () => ({ migrateDatabase: mocks.migrate }));
import { createMigratedDataSource } from './create-data-source.js';

describe('migrated data source', () => {
  const dataSource = { destroy: mocks.destroy };
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.initialize.mockResolvedValue(dataSource);
  });

  it('does not resolve the data source until migrations complete', async () => {
    let completeMigration!: () => void;
    mocks.migrate.mockReturnValue(
      new Promise<void>((resolve) => {
        completeMigration = resolve;
      }),
    );
    const resolved = vi.fn();
    const creation = createMigratedDataSource({ type: 'postgres' }).then(
      resolved,
    );
    await vi.waitFor(() =>
      expect(mocks.migrate).toHaveBeenCalledWith(dataSource),
    );
    expect(resolved).not.toHaveBeenCalled();
    completeMigration();
    await creation;
    expect(resolved).toHaveBeenCalledWith(dataSource);
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it('closes the initialized connection when migrations fail', async () => {
    const failure = new Error('Migration failed');
    mocks.migrate.mockRejectedValue(failure);
    await expect(createMigratedDataSource({ type: 'postgres' })).rejects.toBe(
      failure,
    );
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects missing options before initializing a connection', async () => {
    await expect(createMigratedDataSource()).rejects.toThrow(
      'Database options are required.',
    );
    expect(mocks.initialize).not.toHaveBeenCalled();
  });
});
