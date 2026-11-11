# @cat-supplies-store/contracts

Shared Zod schemas and inferred TypeScript types for communication boundaries: chat, customer orders, catalog operations, refunds, health, and email jobs. The API, Agent API, and worker use these contracts to validate exchanged data.

The main entry point contains schemas and queue/job names. The Node-only `@cat-supplies-store/contracts/email-job-id` entry point creates stable email job IDs from the requester and message IDs, keeping Node crypto out of the main schema entry point.

Business rules, authorization, and persistence remain in the backend services.
