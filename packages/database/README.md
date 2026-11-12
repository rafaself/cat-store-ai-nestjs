# @cat-supplies-store/database

Shared PostgreSQL persistence foundations for the Business API, Agent API and Agent Worker: TypeORM entities for customers, orders, payments, refunds, products, email drafts, conversations, turns, tool executions, and approvals, plus connection options and SQL migrations.

`databaseOptions` configures the entities with schema synchronization disabled. `createMigratedDataSource` initializes a connection and applies pending migrations. `migrateDatabase` records applied migrations in `schema_migrations` and serializes migration execution with a PostgreSQL advisory lock.

This package has no Nest dependency. Feature repositories and business rules live with their owning application or domain package.

Database changes must follow the [database operations policy](database-operations.md), including query API selection, transaction boundaries, concurrency guarantees, and connection cleanup.

Conversation CRUD uses the four entity mappings through the Agent API repository. Conditional transitions and joins use QueryBuilder; session-bound operations use the QueryRunner manager. PostgreSQL advisory locks, JSONB equality, the single-statement history snapshot, and atomic multi-table CTEs remain parameterized SQL. Entity JSONB fields are stored as unknown; SDK-specific message types stay in the Agent API. These mappings do not change the schema or enable synchronization. Turn sequence and request IDs are unique within a conversation. Tool journals and approval state are separate from UI snapshots and model messages; no credentials are stored in conversation records.
