/**
 * Ollama provider - talks to a local Ollama instance via its OpenAI
 * chat-completions-compatible endpoint (http://localhost:11434/v1 by
 * default). Delegates the actual request/response handling to
 * createOpenAICompatibleReviewer.
 */

import { createOpenAICompatibleReviewer } from "../shared/openaiCompatibleProvider.js";
import type { RawReview, ReviewContext, ReviewProvider } from "../shared/types.js";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

export interface OllamaProviderOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  maxOutputTokens?: number;
}

export class OllamaProvider implements ReviewProvider {
  readonly name = "ollama" as const;

  private readonly delegate: ReviewProvider;

  constructor(options: OllamaProviderOptions = {}) {
    // Ollama does not require a real API key for local use, but the OpenAI
    // SDK requires some non-empty string - fall back to a placeholder.
    const apiKey = options.apiKey ?? process.env.OLLAMA_API_KEY ?? "ollama";

    const model = options.model ?? process.env.OLLAMA_MODEL;
    if (!model) {
      throw new Error(
        'Missing Ollama model. Set the OLLAMA_MODEL environment variable, or pass { model } when ' +
          'constructing OllamaProvider to the name of a model you have pulled locally (e.g. "ollama pull ' +
          'llama3.1", then OLLAMA_MODEL=llama3.1). The model must support tool/function calling.',
      );
    }

    const baseURL = options.baseURL ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;

    this.delegate = createOpenAICompatibleReviewer({
      providerName: this.name,
      apiKey,
      model,
      baseURL,
      maxOutputTokens: options.maxOutputTokens,
    });
  }

  async review(context: ReviewContext): Promise<RawReview> {
    return this.delegate.review(context);
  }
}
