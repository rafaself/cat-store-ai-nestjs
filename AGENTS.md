## Instructions

- You may use [NestJS Documentation](https://docs.nestjs.com/llms.txt).
- You may use a file in the `tmp` directory as persistent working memory to track progress, preserve important context, and prevent critical information from being lost when the conversation context is truncated.
- You may create and manage Goals autonomously when a task involves multiple steps, iterative execution, or measurable acceptance criteria. Use Goals selectively when they improve focus and progress tracking, without introducing unnecessary overhead for simple tasks.
- Follow project convetions.

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
