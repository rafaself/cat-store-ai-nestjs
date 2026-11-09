# llm-chatbot-nestjs

A minimal full-stack monorepo starter for an LLM-powered chatbot. It currently
provides a React frontend, a NestJS health endpoint, validated environment
configuration, and shared package shells. Chat and provider integrations are
not implemented yet.

## Prerequisites

- Node.js 24 LTS (24.15.0 or newer in the 24.x line)
- pnpm 12.6.0

The repository pins pnpm through `packageManager` and declares its supported
Node.js range in `package.json`.

## Installation and environment

```sh
pnpm install
cp .env.example .env
```

`OPENAI_API_KEY` is optional while the project has no LLM endpoint. The default
local configuration uses port `3000` and model `gpt-4o-mini`. Environment values
are validated during application startup.

## Development

```sh
pnpm dev
```

This starts the API and React frontend together. The API listens on the
configured port; check `GET /health` for a JSON health response. The frontend
is served by Vite at the local address shown in its terminal output.

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

These checks run without an OpenAI API key or external services.
`pnpm typecheck` checks the API, shared packages, and React frontend.

## Monorepo structure

- `apps/api` contains the NestJS application, health route,
  environment validation, and unit/e2e tests.
- `apps/web` contains the React frontend, built and served with Vite.
- `packages/tools` contains a small pure function shared through Nest's
  `@app/tools` library alias.
- `packages/contract`, `database`, `shared`, `storage`, and `config` are minimal
  Nest library package shells with independent TypeScript build configs.
- `nest-cli.json` defines the NestJS monorepo projects, including `apps/api`.
- `turbo.json` defines build and development task coordination for the
  workspace. `pnpm build` builds all workspace packages through Turborepo.
- `pnpm-workspace.yaml` discovers packages under `apps/*` and `packages/*`.
  The root package owns shared tooling; each app declares its runtime and
  framework dependencies in its workspace manifest.
- Root-level TypeScript, Vitest, Oxlint, and Prettier configuration is shared
  across the workspace.
