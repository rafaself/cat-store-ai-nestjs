# @cat-supplies-store/ai

Shared Amazon Bedrock setup for Nest AI modules. Used by the Business API for catalog embeddings and by Agent API and Agent Worker for language models.

- `createBedrockConfig` registers parsed Bedrock settings with Nest configuration.
- `buildAiOptions` registers all configured language and embedding models.
- `buildEmbeddingOptions` registers all configured embedding models without language models.

Applications own their prompts, tools, and business rules. Provider credentials come from the supplied configuration without modifying `process.env`.

Language models are discovered at startup from `BEDROCK_MODEL_*` environment
variables. `BEDROCK_MODEL_DEFAULT` is always required; there is no model ID
fallback. Suffixes must match `[A-Z][A-Z0-9_]*` and become lowercase aliases:
`BEDROCK_MODEL_FAST_REASONING` registers `fast_reasoning`. IDs are trimmed and
must be nonblank. All aliases share the configured AWS region and credentials.
Restart the application after changing the registry. Services select registered
aliases with `model: 'alias'`; existing services use `default`.

Embedding models follow the same rules through `BEDROCK_EMBEDDING_MODEL_*`.
`BEDROCK_EMBEDDING_MODEL_DEFAULT` is always required with no fallback;
`BEDROCK_EMBEDDING_MODEL_SEARCH_V2` registers the embedding alias `search_v2`.
Language and embedding registries are separate, so both may use the same alias
for different model IDs. Both defaults must be provided when loading Bedrock
configuration, including in the embedding-only Business API.

Catalog indexing and search use the embedding alias `default` and require
1024-dimensional vectors. The example selects Titan Text Embeddings v2. Before
switching the catalog's default embedding model, rebuild all stored product
embeddings with that model; equal dimensions alone do not make vectors from
different models comparable.
