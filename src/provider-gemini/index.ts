/**
 * provider-gemini package entry point. Re-exports the Gemini provider.
 * Does NOT register the provider into any registry - that wiring happens
 * elsewhere (e.g. in the CLI or core composition root).
 */

export * from "./geminiProvider.js";
