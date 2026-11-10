# llm-chatbot-nestjs

A cat-store support example with a React frontend, NestJS API, and Turborepo
workspace. It demonstrates support email triage and drafting, invoice extraction,
customer-scoped order tools, durable refund approvals, and product semantic
search. Text generation uses GPT-6 Luna through Amazon Bedrock; product vectors
use Amazon Titan Text Embeddings v2.

## Prerequisites

- Node.js 24 LTS (24.15.0 or newer in the 24.x line)
- pnpm 12.6.0
- Docker Compose with the Docker Compose plugin
- Bedrock access to the `us.openai.gpt-6-luna` inference profile and Titan
  embeddings in the configured AWS region for live AI requests

The repository pins pnpm through `packageManager` and declares its supported
Node.js range in `package.json`.

## Installation and environment

```sh
pnpm install
cp .env.example .env
```

The API uses the single Nest AI text model `default`, configured directly as
`amazonBedrock('us.openai.gpt-6-luna')`. `AWS_REGION` defaults to `us-east-1`.
The embedding registry's `default` model is Amazon Titan Text Embeddings v2,
which returns 1024-dimensional vectors. Set `AWS_BEARER_TOKEN_BEDROCK` in
`.env`, or set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for SigV4
authentication (also set `AWS_SESSION_TOKEN` when using temporary credentials).
Chat, email AI services, product indexing, and product search need Bedrock
credentials.

The sample connects to PostgreSQL with pgvector. Start the local database first:

```sh
docker compose up -d db
```

The first database initializes both `chatbot` for development and
`chatbot_test` for end-to-end tests. Set `DATABASE_URL` in `.env` if needed.
Compose publishes PostgreSQL on `127.0.0.1:15432` by default.
The API applies tracked SQL migrations at startup and seeds two demo customers,
sample orders, payments, and products. Product embeddings are generated on
demand with `POST /catalog/index`; the route requires the support bearer token.

The example uses `DEMO_CUSTOMER_TOKEN` for the seeded `cus_123` identity and
`SUPPORT_APPROVAL_TOKEN` for refund review and catalog indexing. The web app
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

This starts the API and React frontend together. The API listens on port `3000`
by default. It serves `GET /health`, authenticated streaming
`POST /assistant/chat`, public `GET /catalog/search?q=...`, support-only
`POST /catalog/index`, customer-authenticated `POST /refunds`, and support-only
refund approval routes under `/refunds/:runId/approvals`. The Vite server proxies
`/api/*` to the API. Chat accepts text-only conversations with up to 40 messages
and is limited to 10 requests per minute per client IP.

The support triage, reply drafting, and invoice extraction services are
injectable Nest providers, ready to be connected to an email intake workflow.
They are not exposed as public HTTP endpoints.

To start either app on its own, run `pnpm --filter @llm-chatbot-nestjs/api dev`
or `pnpm --filter @llm-chatbot-nestjs/web dev`.

## Testing and build

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Start Compose before `pnpm test:e2e`; end-to-end tests use `chatbot_test` and
Nest's fake language and embedding models. Unit and e2e tests do not contact
Bedrock or a payment provider. Formatting and static checks also run without
external service calls.

## Monorepo structure

- `apps/api` contains the NestJS application, Bedrock models, assistant and
  catalog routes, support/order/refund modules, health route, and unit/e2e
  tests. Its feature modules inject TypeORM repositories and contain the
  PostgreSQL queries used for catalog, order, and payment operations. Feature
  modules live in `apps/api/src/apps`; database integration lives in
  `apps/api/src/database`.
- `apps/web` contains the React chat interface, built and served with Vite.
- `packages/config` provides typed API, database, Bedrock, auth, and workflow
  settings. `packages/contracts` owns request and response schemas at the HTTP
  boundary.
- `packages/database` owns TypeORM entities, connection options, and the
  existing SQL migration. It has no Nest dependency. The API configures
  TypeORM and runs the migration at startup with the existing migration ledger.
- `packages/workflow-storage` adapts a dedicated PostgreSQL pool to durable
  workflow persistence.
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
