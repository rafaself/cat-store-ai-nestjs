# @cat-supplies-store/config

Typed environment configuration shared by the Nest applications. It validates settings for HTTP, logging, authentication, Bedrock, PostgreSQL, workflows, Redis queues, and Mailpit.

Use the individual `load*Config` functions for each application's needs. `validateEnvironment` combines the Business API's core settings. `readEnvironment` reads an optional environment file, gives ambient variables precedence, and leaves `process.env` unchanged.

This package parses settings; applications wire them into their Nest modules.
