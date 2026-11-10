import {
  Global,
  Module,
  type DynamicModule,
  type InjectionToken,
  type Provider,
} from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from './database.constants.js';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { OrdersRepository } from './repositories/orders.repository.js';
import { PaymentsRepository } from './repositories/payments.repository.js';
import { DatabaseService } from './database.service.js';

export interface DatabaseModuleOptions {
  connectionString: string;
  max?: number;
  connectionTimeoutMillis?: number;
}

export interface DatabaseModuleAsyncOptions {
  imports?: DynamicModule['imports'];
  inject?: InjectionToken[];
  useFactory: (
    ...dependencies: any[]
  ) => DatabaseModuleOptions | Promise<DatabaseModuleOptions>;
}

@Global()
@Module({})
export class DatabaseModule {
  static forRootAsync(options: DatabaseModuleAsyncOptions): DynamicModule {
    const poolProvider: Provider = {
      provide: DATABASE_POOL,
      inject: options.inject ?? [],
      useFactory: async (...dependencies: unknown[]) => {
        const databaseOptions = await options.useFactory(...dependencies);
        return new Pool({
          connectionString: databaseOptions.connectionString,
          max: databaseOptions.max ?? 10,
          connectionTimeoutMillis:
            databaseOptions.connectionTimeoutMillis ?? 5_000,
        });
      },
    };

    return {
      module: DatabaseModule,
      imports: options.imports,
      providers: [
        poolProvider,
        DatabaseService,
        CatalogRepository,
        OrdersRepository,
        PaymentsRepository,
      ],
      exports: [
        DATABASE_POOL,
        DatabaseService,
        CatalogRepository,
        OrdersRepository,
        PaymentsRepository,
      ],
    };
  }
}
