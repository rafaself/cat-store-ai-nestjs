# @cat-supplies-store/database

Shared PostgreSQL persistence foundations for the Business API and Agent Worker: TypeORM entities for customers, orders, payments, refunds, products, and email drafts, plus connection options and SQL migrations.

`databaseOptions` configures the entities with schema synchronization disabled. `createMigratedDataSource` initializes a connection and applies pending migrations. `migrateDatabase` records applied migrations in `schema_migrations` and serializes migration execution with a PostgreSQL advisory lock.

This package has no Nest dependency. Feature repositories and business rules live with their owning application or domain package.
