/**
 * provider-ollama package entry point. Re-exports the Ollama provider.
 * Does NOT register the provider into any registry - that wiring happens
 * elsewhere (e.g. in the CLI or core composition root).
 */

export * from "./ollamaProvider.js";
