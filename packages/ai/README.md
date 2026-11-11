# @cat-supplies-store/ai

Shared Amazon Bedrock setup for Nest AI modules. Used by the Business API for catalog embeddings and by Agent API and Agent Worker for language models.

- `createBedrockConfig` registers parsed Bedrock settings with Nest configuration.
- `buildAiOptions` configures the default language and embedding models.
- `buildEmbeddingOptions` configures only the default embedding model.

Applications own their prompts, tools, and business rules. Provider credentials come from the supplied configuration without modifying `process.env`.
