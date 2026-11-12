## Instructions

- You may use [NestJS Documentation](https://docs.nestjs.com/llms.txt).
- You may use a file in the `tmp` directory as persistent working memory to track progress, preserve important context, and prevent critical information from being lost when the conversation context is truncated.
- You may create and manage Goals autonomously when a task involves multiple steps, iterative execution, or measurable acceptance criteria. Use Goals selectively when they improve focus and progress tracking, without introducing unnecessary overhead for simple tasks.
- Follow project convetions.

## Database operations

Before adding or changing database operations, read and follow [Database operations policy](packages/database/database-operations.md). It defines how to choose TypeORM repositories, QueryBuilder, and raw SQL, and the required transaction, concurrency, and connection-lifecycle guarantees. Apply it to the work in scope; do not refactor unrelated persistence code merely to standardize syntax.

## Task completion

Before completing any task that modifies code:

1. Run `pnpm format` first.
2. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` in parallel.
3. Address any failures and rerun the affected checks.
4. Report any checks that could not be completed.

Do not skip checks or suppress failures.

## Testing Integrity

- Never modify, weaken, or bypass tests merely to make them pass.
- Tests must reflect the application's domain rules and expected behavior.
- Investigate root causes before changing implementation or tests.
- Fix incorrect tests only when justified by domain requirements.
- Prioritize correctness over passing the test suite.

## Project Principles

### Clean Code Best Practices

1. Single Responsibility Principle (SRP): Each class, module, or function should have one clearly defined responsibility.
2. Separation of Concerns: Keep controllers, services, repositories, and agent tools focused on their respective responsibilities.
3. DRY (Don't Repeat Yourself): Avoid duplicating business logic, but don't introduce premature abstractions.
4. KISS (Keep It Simple, Stupid): Prefer simple, explicit solutions over unnecessary architectural complexity.
5. YAGNI (You Aren't Gonna Need It): Implement only what is currently needed. Avoid speculative features and abstractions.
6. Dependency Inversion Principle (DIP): Depend on well-defined contracts at important boundaries rather than internal implementations.
7. Clear Naming: Use descriptive, intention-revealing names. Avoid unnecessary abbreviations and vague names like `Manager`, `Helper`, or `Utils`.
8. Small, Cohesive Functions: Keep functions focused, readable, and limited in side effects.
9. Explicit Error Handling: Validate inputs with Zod, use appropriate exceptions, and never silently swallow errors.
10. Testability: Prioritize behavior-driven tests and business rules over implementation details.

### Additional Principle for AI Agents

Separate probabilistic decisions from deterministic business rules. LLMs may interpret user intent and select tools, but authentication, authorization, validation, and data mutations must remain under backend control.

Core principle: Write simple, cohesive, testable, and loosely coupled code. Don't introduce design patterns or abstractions unless they solve a concrete problem.
