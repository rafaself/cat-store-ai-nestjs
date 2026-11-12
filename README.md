# cat-supplies-store

A cat-store support example with a React frontend, separate NestJS business/agent APIs, and Turborepo
workspace. It demonstrates support email triage and drafting, invoice extraction,
customer-scoped order tools, durable refund approvals, and product semantic
search. Language and embedding models are declared in `packages/ai/src/config.ts`;
the example uses Amazon Bedrock with Titan Text Embeddings v2 for product vectors.

## Prerequisites

- Node.js 24 LTS (24.15.0 or newer in the 24.x line)
- pnpm 12.6.0
- Docker Compose with the Docker Compose plugin
- Access and credentials for the configured language and embedding models

The repository pins pnpm through `packageManager` and declares its supported
Node.js range in `package.json`.

## Installation and environment

```sh
pnpm install
cp .env.example .env
```

The APIs and Agent Worker read `.env` into their configuration without changing
`process.env`. Values already present in the process environment take precedence.

The Nest applications share explicit, typed model selections in
`packages/ai/src/config.ts`. The default language model remains
`us.openai.gpt-6-luna` on Bedrock, and the default embedding model remains
`amazon.titan-embed-text-v2:0` on Bedrock. Edit these selections in code when
changing models; model registrations are reviewed and deployed with the application.
Environment variables do not select models or create aliases.

Supported adapters are Bedrock, Anthropic, and OpenAI. Embeddings support
Bedrock and OpenAI. Services select `default`; add named models in the code
configuration when a task needs one. Shared timeout, retry, and output-limit
defaults also live in `packages/ai/src/config.ts`. Task-specific generation
settings belong beside the service that owns the task.

Only selected providers have their settings validated. Bedrock requires
`AWS_BEARER_TOKEN_BEDROCK` or both `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY`; temporary credentials also use `AWS_SESSION_TOKEN`.
`AWS_REGION` defaults to `us-east-1`. Direct Anthropic calls require
`ANTHROPIC_API_KEY`; direct OpenAI calls require `OPENAI_API_KEY` and optionally
accept `OPENAI_BASE_URL` (default `https://api.openai.com/v1`). The OpenAI language
adapter uses Responses, so a custom endpoint must support that API.
Credentials and deployment connection settings stay in the environment and are
passed explicitly to SDK factories without modifying `process.env`. Missing or
invalid selected-provider settings fail startup. The Business API constructs
only embedding providers; the Agent API and Worker construct providers used by
both model selections.

Catalog indexing and search use the embedding alias `default`, which must
produce 1024-dimensional vectors. Changing that model requires rebuilding all
stored product embeddings before searching, even if vector dimensions match.
The example selects Amazon Titan Text Embeddings v2.

The sample uses PostgreSQL with pgvector, Redis, and Mailpit. Start them first:

```sh
docker compose up -d db redis mailpit
```

The first database initializes both `chatbot` for development and
`chatbot_test` for end-to-end tests. Set `DATABASE_URL` in `.env` if needed.
Compose publishes PostgreSQL on `127.0.0.1:15432` by default.
Existing database volumes created before the test database initialization was
added may need `docker compose exec db createdb -U chatbot chatbot_test` once.
The API and worker apply tracked SQL migrations at startup and seed two demo customers,
sample orders, payments, and products. Product embeddings are generated on
demand with `POST /catalog/index`; the route requires the support bearer token.

The example uses `DEMO_CUSTOMER_TOKEN` for the seeded `cus_123` identity and
`SUPPORT_APPROVAL_TOKEN` for refund review, catalog indexing, and email jobs. The web app
reads `VITE_DEMO_CUSTOMER_TOKEN` from the root `.env`. These demo guards refuse
requests when `NODE_ENV=production`; use a real authentication system before
deploying. Generate a private `WORKFLOWS_ENCRYPTION_KEY` with
`openssl rand -base64 32` before running locally. The sample payment service
only records simulated, idempotent refunds in PostgreSQL; it has no payment
provider integration.

## Development

```sh
pnpm dev
```

This starts all four applications. The Business API listens on `PORT` (default
`3000`), and the Agent API on `AGENT_API_PORT` (default `3001`). Both expose
`GET /health`. The Agent API serves authenticated conversations under `/assistant/conversations`.
The Business API serves public `GET /catalog/search?q=...`, support-only
`POST /catalog/index`, customer-authenticated `POST /refunds`, and support-only
refund approval routes under `/refunds/:runId/approvals`. The Vite server proxies
`/api/*` to the Business API and `/agent-api/*` to the Agent API. Message submission accepts only a UUID `requestId` and `text` (1–4,000 characters). It is limited to 10 requests per minute per client IP; history reads allow 120 per minute for recovery polling.

### Agent-to-business boundary

Set `BUSINESS_API_URL` on the Agent API to the reachable Business API origin
(default `http://127.0.0.1:3000`). Agent API requires `DATABASE_URL` for conversation storage. It does not need Redis, Mailpit, workflow encryption, or demo token configuration. It validates chat
credentials through `GET /agent-tools/customer` before starting a model call.
The typed client forwards the original Authorization header to the Business API;
it never sends a customer ID selected by the model.

Protected Business API interfaces are `GET /agent-tools/orders/:orderId`,
`PATCH /agent-tools/orders/:orderId/address`, and
`GET /agent-tools/catalog/search?q=...&limit=...`. The Business API validates
inputs, derives customer identity, checks ownership, and enforces eligible
order statuses on address updates. The existing public catalog routes remain
available. HTTP failures fail closed and do not expose upstream response bodies.

Address changes require an explicit confirmation button in the chat. The
`change-address` tool first proposes the change without mutating the order.
The Business API stores a five-minute confirmation bound to the authenticated
customer, order, and exact address. Only the dedicated Agent API approval endpoint can approve and apply the stored proposal through the Business API; approval and execution are not model tools. The API consumes it atomically with
the update, rejects unapproved, expired, or reused confirmations, and rechecks
ownership and eligibility. A textual “yes” alone cannot authorize a change.

For independent production builds, run `pnpm --filter <package>... build`, then
`pnpm --filter <package> start` for any Nest application. The React app supports
`pnpm --filter @cat-supplies-store/web build` and `preview`. Configure your reverse
proxy with the same `/api` and `/agent-api` routes used in development; the
Vite proxy applies only during development. Use compatible contract versions and
protect transport between applications when deploying to separate hosts.

### Refund workflows

The API persists refund requests, serves status, and records support approvals.
It does not execute workflows. The worker runs refund workflows, calls the model,
and issues approved simulated refunds. Requests and approval decisions remain in
PostgreSQL while the worker is offline and resume when it returns.

Both processes must use the same `DATABASE_URL` and `WORKFLOWS_ENCRYPTION_KEY`.
The workflow names, versions, and encryption key ID remain unchanged, so existing
pending refunds can resume after this split. Deploy compatible API and worker
versions together. Stop old API instances that still execute workflows before
starting the new worker to avoid mixed execution during the transition.

### Email drafting

Mailpit captures test messages at SMTP `127.0.0.1:11025` and provides its web UI
and API at `http://127.0.0.1:18025`. Submit a test message, then use its returned
message ID to request a draft:

```sh
curl -X POST http://127.0.0.1:18025/api/v1/send \
  -H 'Content-Type: application/json' \
  -d '{"From":{"Email":"customer@example.test","Name":"Pat"},"To":[{"Email":"support@example.test"}],"Subject":"My order","Text":"My order arrived damaged."}'

curl -X POST http://127.0.0.1:3000/email-jobs \
  -H 'Authorization: Bearer demo-support-token-change-me' \
  -H 'Content-Type: application/json' -d '{"messageId":"MAILPIT_MESSAGE_ID"}'

curl http://127.0.0.1:3000/email-jobs/JOB_ID \
  -H 'Authorization: Bearer demo-support-token-change-me'
```

Use the `ID` returned by Mailpit and the `jobId` returned by the API. Substitute
your configured support token if it differs from the example. Submitting a job
is explicit; Mailpit messages are not automatically enqueued. The worker reads
plain-text messages up to 2 MiB, classifies the first 12,000 characters, and
stores a reply draft for review. Reading a message marks it as read in Mailpit.
It does not send an email. Mailpit captures test messages and does not connect
to a real inbox. Its API is bound to localhost by the provided Compose setup.

Email jobs are support-only and use the single demo support identity; real
multi-user deployments need a real identity and mailbox authorization. Redis
stores job identifiers and status, not message contents. Completed queue entries
expire after seven days, failed entries after 30 days, and drafts remain in
PostgreSQL. A repeated request for the same message returns the existing draft.
If a worker fails before saving a draft, a retry may call the model again; the
database constraint ensures only one draft is saved for that message and identity.

To start one app on its own, use `pnpm --filter @cat-supplies-store/api dev`,
`pnpm --filter @cat-supplies-store/agent-api dev`,
`pnpm --filter @cat-supplies-store/agent-worker dev`, or
`pnpm --filter @cat-supplies-store/web dev`.

## Testing and build

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Husky installs Git hooks through the `prepare` script during `pnpm install`.
Before each commit, `lint-staged` formats staged files with Prettier and
re-stages the formatting fixes while preserving unstaged edits. The hook then
runs lint, typecheck, and unit tests in parallel. Any failure blocks the commit.
Formatting runs at commit time, not during `git add`. Run `pnpm lint-staged`
to format staged changes manually.

Start services with `docker compose up -d --wait` before `pnpm test:e2e`;
CI starts and waits for the same services automatically. End-to-end tests use
`chatbot_test` and
Nest's fake language and embedding models. Unit and e2e tests do not contact
Bedrock or a payment provider. Formatting and static checks also run without
external service calls.

E2e defaults target the local Compose ports and the `chatbot_test` database.
Explicit environment variables take precedence over these defaults and `.env`
settings. For services hosted elsewhere, set `DATABASE_URL`,
`REDIS_HOST`, `REDIS_PORT`, and `MAILPIT_URL`.

## Monorepo structure

- `apps/api` owns business logic, authorization, catalog embeddings, persistence,
  and HTTP routes for refunds, approvals, email jobs, and catalog operations.
  It has no interactive assistant or language model registration.
- `apps/agent-api` owns the assistant, language model integration, three chat
  tools, HTTP streaming, disconnect cancellation, and chat rate limiting.
  Its typed HTTP client uses schemas from `packages/contracts`; it has no
  database, queue, workflow, or Business API implementation dependencies.
  The feature lives in `src/apps/assistant`, including its tool adapters.
  `src/integrations/business-api` owns the HTTP client and exports it through
  `BusinessApiModule`; `src/auth` contains the customer authentication guard,
  and `src/config` validates Agent API settings.
- `apps/agent-worker` owns email triage/drafting, invoice extraction, and durable
  refund execution. Renaming the app does not change queue/job names, workflow
  names/versions, migration tables, encryption key IDs, or persisted state.
- `apps/web` contains the React chat interface, built and served with Vite.
- `packages/ai` owns model selections, shared AI defaults, and provider setup. The Business API registers only
  the embedding model for catalog search/indexing; Agent API and Agent Worker
  register the existing AI configuration.
- `packages/config` provides typed API, database, AI provider, auth, and workflow
  settings. `packages/contracts` owns request and response schemas at the HTTP
  boundary. Its Node-only `@cat-supplies-store/contracts/email-job-id` entry
  point defines the stable persisted email job identity used by both producer
  and worker, keeping Node crypto out of the browser-safe schema entry point.
- `packages/database` owns TypeORM entities, connection options, and the
  existing SQL migration. It has no Nest dependency. The API configures
  TypeORM and runs the migration at startup with the existing migration ledger.
- `packages/workflow-storage` provides shared workflow configuration and a
  Nest persistence module with a dedicated PostgreSQL pool.
- `packages/refunds` provides the refund workflow, worker execution module,
  and payment persistence services. Its dependency-free `/contract` entry point
  shares the workflow name, version, timeout, and input type with the API. The
  API starts work by name without importing the worker execution providers.
- `packages/shared` contains domain types used by both persistence and HTTP
  contracts. `packages/tools` contains framework-independent helper functions
  used by config parsing.
- `nest-cli.json` defines the NestJS monorepo projects, including `apps/api`.
- `turbo.json` defines build and development task coordination for the
  workspace. `pnpm build` builds all workspace packages through Turborepo.
- `pnpm-workspace.yaml` discovers packages under `apps/*` and `packages/*`.
  The root package owns shared tooling; each app declares its runtime and
  framework dependencies in its workspace manifest.
- Root-level TypeScript, Vitest, Oxlint, and Prettier configuration is shared
  across the workspace.

## Logging

The APIs and Agent Worker use Nest's built-in console logger with shared configuration.
Development defaults to `debug`, tests to `warn`, and production to `log`.
Production (`NODE_ENV=production`) emits JSON without colors; development and
tests use readable console output.

Set `LOG_LEVEL` to `verbose`, `debug`, `log`, `warn`, `error`, or `fatal` to
override the minimum level. Messages at that level and higher severity are
enabled; `log` is Nest's informational level. Existing contextual loggers use
the same application configuration. No log files or external log service are
configured.

### Chat streaming and resource limits

The Agent API owns conversation history in PostgreSQL. Run the normal migrations before deploying; startup also applies pending migrations with the existing migration lock. Migration `005-conversations` adds customer-owned conversations, ordered turns (user text, model messages and UI snapshots), tool executions, and approval state. Existing browser-only chats are not imported.

- `POST /assistant/conversations` with `{}` creates a conversation.
- `GET /assistant/conversations` lists the customer's latest 50 conversations.
- `GET /assistant/conversations/:conversationId` returns UI messages, turn statuses, approval states and whether a turn is active.
- `POST /assistant/conversations/:conversationId/messages` accepts exactly `{ "requestId": "<UUID>", "text": "Hello" }` and streams an AI SDK UI response.
- `POST /assistant/conversations/:conversationId/approvals/:confirmationId` accepts exactly `{ "requestId": "<UUID>" }`. It approves and applies the stored proposal through the Business API, without model interpretation or client-supplied order/address fields.

All routes authenticate through the Business API and check conversation ownership. Unexpected request fields are rejected. HTTP JSON and form bodies are limited to 100 KiB before validation. Assistant messages, tool calls/results and customer identity are never accepted as message input. Model context comes only from persisted server records. Stored history is data, not authorization: the Business API checks current customer ownership, eligibility, exact approved address, expiry and single-use consumption on every mutation. Address tool schemas stay internal; the model can propose an address change but cannot approve or apply one.

A request ID is scoped to a conversation. Once accepted it is never executed again, including after failure or interruption. Reusing it with different input returns 409. A completed duplicate returns JSON `{ turnId, status, replayed: true }`; retrieve history for the result. While a turn is active, further submissions (including retries) return 409 and clients should poll history. No chunk-level stream resumption or automatic execution retry is provided.

PostgreSQL session advisory locks serialize each conversation across Agent API instances. Generation holds one connection, but no database transaction. A unique running-turn index is an additional safeguard. On connection/process loss the next successful lock holder marks unfinished turns interrupted and unfinished operations unknown; it never replays them. Tool starts and completed results are persisted independently of model completion. A remote operation and its journal write cannot be atomic: if the remote outcome is uncertain, it is shown as unknown and must be checked before a new attempt. Single-use address confirmations still prevent repeated mutations at the Business API boundary. Use direct PostgreSQL connections or session pooling; transaction-pooling proxies are incompatible with these session locks.

Browser disconnects stop delivery, not execution. The server drains generation, saves its result and releases admission after persistence. The frontend stores the conversation ID locally and reloads server history on startup, completion, errors and disconnects. Stop means stop receiving; active execution is recovered by polling. Partial text is not checkpointed token by token; after a process crash history recovers completed operations and an interrupted status. Slow readers detach once their response queue exceeds 256 KiB. The installed AI library also retains its generation chunks internally, so this queue bound is not a total memory guarantee.

Each generation allows four model calls and a two-minute execution deadline. Per-process limits remain one generation per customer and 20 total (429/503 on saturation); cross-instance serialization is per conversation. The Agent API connection pool allows 30 connections, including the connections held by generations. Conversations allow 40 model turns and a 100,000-character serialized model-context limit; start a new conversation when full. Explicit approvals remain available at that limit. Shutdown aborts and waits for active generation finalization. A crashed process is recovered on the next conversation access; there is no background executor or automatic provider retry after a crash.

Offline unit tests cover strict contracts, byte limits, detached delivery, capacity, deadlines and shutdown. PostgreSQL integration tests cover ownership, idempotency, cross-instance exclusion, tool journaling, interrupted execution recovery, dedicated approvals and multi-turn context. Run `pnpm test` and `pnpm test:e2e` with the documented local services. These checks do not establish live-provider behavior or a production throughput/memory ceiling.
