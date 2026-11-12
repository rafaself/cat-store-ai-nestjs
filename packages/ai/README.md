# @cat-supplies-store/ai

Shared model configuration and AI SDK provider setup for Nest AI modules.

- `src/config.ts` declares typed language and embedding model selections and shared AI defaults.
- `loadAiConfig` combines those selections with validated provider environment settings.
- `createAiConfig` registers the resulting settings under the Nest configuration key `ai`.
- `buildAiOptions` registers language and embedding models using their explicit aliases.
- `buildEmbeddingOptions` registers only embeddings and constructs only their providers.

The default language model is Bedrock `us.openai.gpt-6-luna`; the default embedding
model is Bedrock `amazon.titan-embed-text-v2:0`. Change models through code review
and evaluation. Environment variables do not select models or create aliases.
Add named models in `src/config.ts` when needed by a task. Shared timeouts,
retries, and output limits live there too; task-specific generation settings
belong to the service that owns the task.

Supported adapters are Bedrock, Anthropic, and OpenAI; only Bedrock and OpenAI
support embeddings. Only selected providers have their settings validated and
only referenced providers are constructed. Applications inject generic AI
configuration; services select model aliases and own prompts, tools,
authorization, and business rules.

Credentials use conventional environment names: `AWS_BEARER_TOKEN_BEDROCK`
(or a complete AWS access-key pair), `ANTHROPIC_API_KEY`, and `OPENAI_API_KEY`.
`packages/config` validates these credentials and deployment connection settings.
Parsed settings are passed explicitly to provider factories without mutating
`process.env`. OpenAI also accepts `OPENAI_BASE_URL`; its language models use
Responses. A new protocol requires an installed adapter and a factory addition.

Catalog indexing/search use embedding alias `default` with 1024-dimensional
vectors. Rebuild all stored product embeddings before changing that model;
equal dimensions do not make different models' vectors comparable.
