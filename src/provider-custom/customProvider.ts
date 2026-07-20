/**
 * Custom provider - talks to any OpenAI chat-completions-compatible
 * endpoint the user points it at: a self-hosted/local LLM server (LM
 * Studio, vLLM, llama.cpp server, text-generation-webui, ...), or any
 * other API that speaks the OpenAI wire format. Unlike the other
 * OpenAI-compatible providers, there is no default base URL - the caller
 * must supply one. Delegates the actual request/response handling to the
 * shared OpenAI-compatible reviewer.
 */

import { createOpenAICompatibleReviewer } from "../shared/openaiCompatibleProvider.js";
import type { RawReview, ReviewContext, ReviewProvider } from "../shared/types.js";

export interface CustomProviderOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  maxOutputTokens?: number;
}

export class CustomProvider implements ReviewProvider {
  readonly name = "custom" as const;

  private readonly delegate: ReviewProvider;

  constructor(options: CustomProviderOptions = {}) {
    const baseURL = options.baseURL ?? process.env.CUSTOM_BASE_URL;
    if (!baseURL) {
      throw new Error(
        'Missing endpoint URL for the custom provider. Set the CUSTOM_BASE_URL environment variable, or pass --base-url / { baseURL } (e.g. "http://localhost:1234/v1" for a local server, or the base URL of any OpenAI-compatible API).',
      );
    }

    const model = options.model ?? process.env.CUSTOM_MODEL;
    if (!model) {
      throw new Error(
        "Missing model for the custom provider. Set the CUSTOM_MODEL environment variable, or pass --model / { model }.",
      );
    }

    // Many self-hosted/local servers don't require a real API key, but the
    // OpenAI SDK still needs a non-empty string - fall back to a
    // placeholder, same as the Ollama provider does.
    const apiKey = options.apiKey ?? process.env.CUSTOM_API_KEY ?? "not-needed";

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
