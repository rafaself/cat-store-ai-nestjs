# @cat-supplies-store/tools

Small, framework-independent functions used across the workspace. Currently exports `toOptionalNonEmptyString`, which trims a string and converts missing, empty, or whitespace-only values to `undefined` for configuration parsing.

These are ordinary code utilities. LLM agent tools live in the applications and domain packages that own their behavior.
