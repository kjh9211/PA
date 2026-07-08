/**
 * provider-openai package entry point. Re-exports the OpenAI provider.
 * Does NOT register the provider into any registry - that wiring happens
 * elsewhere (e.g. in the CLI or core composition root).
 */

export * from "./openAIProvider.js";
