# Database operations policy

This is the repository policy for database work by developers and agents. Read it before adding or changing persistence behavior. It defines the intended approach; existing code may not yet follow every convention. Apply it incrementally to the work in scope, preserving behavior and consistency guarantees. A skill may reference this policy for a workflow, but must not duplicate or replace it.

## Choose the simplest appropriate query API

Use the existing PostgreSQL and TypeORM stack. Choose by the operation's requirements, rather than a target number of SQL strings or a preference for fluent syntax.

| Operation                                                                                                        | Default approach                                                    |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Simple inserts, lookups, existence checks, filtering, and ordering                                               | TypeORM repository methods with entity mappings.                    |
| Conditional state transitions, affected-row checks, joins, and composable predicates                             | TypeORM QueryBuilder.                                               |
| PostgreSQL advisory locks, JSONB-specific expressions, atomic multi-table CTEs, and specialized snapshot queries | Parameterized raw SQL when it expresses the guarantee more clearly. |
| Schema changes, constraints, and indexes                                                                         | SQL migrations using the existing migration mechanism.              |

These are defaults, not a ban on SQL for other operations. Keep a short SQL query when converting it would add complexity without a concrete benefit. Explain non-obvious consistency requirements near the operation. Do not wrap mostly unchanged SQL in fluent calls merely to appear ORM-based.

For ordinary persistence used by multiple operations, prefer small entity mappings consistent with the project's existing entities. Add relationships, cascades, listeners, or eager loading only for an actual requirement. Keep schema synchronization disabled; migrations remain authoritative. Entity types and generic query return types do not provide runtime validation of external data or JSONB contents.

Do not introduce another ORM, query library, generic repository layer, or unit-of-work abstraction just to change query syntax. Follow the project's dependency approval rules for any proposed dependency.

## Keep persistence with its owner

- Shared connection foundations, entities, and migrations belong in `packages/database`; it has no Nest dependency.
- Feature repositories belong with the owning application or domain package. Encapsulate queries there; services orchestrate business operations rather than constructing SQL or fluent database queries.
- Preserve application boundaries. For example, the Agent API owns conversations; order mutations go through the Business API rather than direct writes to its tables.
- Derive identity from authentication and enforce ownership in database access. Persisted conversation content and model-selected arguments never grant authorization.

## Preserve transaction and connection boundaries

`QueryRunner` controls the connection and transaction. Repositories, QueryBuilder, and SQL are ways to execute queries; changing between them does not replace connection management.

- Execute every operation participating in a transaction through that runner or its manager. Use session-bound repositories and builders when a session lock requires the same physical connection. Do not accidentally use an injected global repository for those operations.
- Keep transactions short. Do not hold them open during LLM generation, network calls, streaming, or user approval waits.
- Commit dependent local state changes atomically through one SQL statement or a short transaction. Never replace an atomic statement with independent autocommit operations.
- Use explicit rollback and release paths, preserving the original error if cleanup also fails. Log cleanup failures without exposing credentials or sensitive payloads.
- A session advisory lock intentionally retains a connection. Verify unlocking and resolve any active transaction before returning it to the pool. Close connections whose cleanup cannot be confirmed. Release must be safe to invoke more than once.
- Bound connection acquisition, database statements, and lock waits. An HTTP or LLM abort signal alone does not cancel database work. Account for retained connections in admission limits and pool sizing.
- Session advisory locks require direct connections or session pooling; transaction pooling is incompatible with their use here.

## Make concurrency guarantees explicit

- Express state transitions as conditional writes with the expected current state in the predicate. Check the affected or returned rows; do not silently report success when no transition occurred.
- Prefer explicit inserts and updates over load–mutate–`save()` for execution state machines. Convenience persistence methods do not establish concurrency guarantees.
- Enforce uniqueness, idempotency keys, and other database invariants with constraints where applicable. Repeated request IDs must not repeat side effects; reject reuse with different input.
- Reject invalid requests before creating execution records unless recording the rejection is an explicit domain requirement.
- When a response combines records that must agree, use one statement snapshot or an appropriate short transaction isolation level. A multi-statement `READ COMMITTED` transaction does not guarantee a shared snapshot.
- Do not assume execution order between data-modifying CTEs. Express dependencies through their returned data, and preserve their atomicity when refactoring.
- Database locks cannot retract already-started remote operations. Keep business-side authorization and idempotency checks. Persist uncertain outcomes conservatively and never automatically replay them as if they had failed.

## Validate the behavior, not the syntax

Evaluate performance through generated SQL, query plans where needed, indexes, round trips, and connection use. Neither SQL nor QueryBuilder is inherently faster or safer.

For changes to locking, transactions, idempotency, or atomic SQL, use PostgreSQL integration tests covering the relevant concurrency and failure paths. Include rollback, affected-row handling, cleanup, and connection loss where applicable. Mock-based unit tests can supplement these checks; they cannot prove PostgreSQL semantics. Avoid tests that merely mirror a fluent call chain.

Retain existing behavior tests when changing query APIs. Follow the root `AGENTS.md` validation requirements for code changes, and report any checks that cannot be completed.
