# @cat-supplies-store/config

Typed environment configuration shared by the Nest applications. It validates settings for HTTP, logging, authentication, AI providers, PostgreSQL, workflows, Redis queues, and Mailpit.

Use the individual `load*Config` functions for each application's needs. `validateEnvironment` combines the Business API's core settings. `readEnvironment` reads an optional environment file, gives ambient variables precedence, and leaves `process.env` unchanged.

This package parses settings; applications wire them into their Nest modules.

`loadAiProviderConfig(environment, selectedProviders)` validates credentials and
connection settings only for the providers selected by the application. Model
selections and generation defaults belong to `packages/ai`; this package does
not discover model aliases or parse model references from environment variables.
