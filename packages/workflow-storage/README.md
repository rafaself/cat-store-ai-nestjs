# @cat-supplies-store/workflow-storage

Shared PostgreSQL infrastructure for Nest workflows, used by the Business API and Agent Worker. `WorkflowPersistenceModule` provides the workflow store through a dedicated connection pool that closes on application shutdown.

- `createWorkflowsConfig` registers parsed workflow settings.
- `buildWorkflowOptions` configures worker execution, retries, and encrypted payloads.
- `buildWorkflowClientOptions` uses the same settings with execution disabled for the API.

Workflow definitions and business operations belong in their domain packages, such as `packages/refunds`.
