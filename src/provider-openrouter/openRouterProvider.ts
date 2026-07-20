/**
 * OpenRouter provider - talks to OpenRouter's OpenAI-compatible endpoint at
 * https://openrouter.ai/api/v1, which fronts many models (Claude, GPT,
 * Gemini, Llama, and more) behind a single API key. Delegates the actual
 * request/response handling to the shared OpenAI-compatible reviewer.
 */

import { createOpenAICompatibleReviewer } from "../shared/openaiCompatibleProvider.js";
import type { RawReview, ReviewContext, ReviewProvider } from "../shared/types.js";

export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterProviderOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  maxOutputTokens?: number;
}

export class OpenRouterProvider implements ReviewProvider {
  readonly name = "openrouter" as const;

  private readonly delegate: ReviewProvider;

  constructor(options: OpenRouterProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing OpenRouter API key. Set the OPENROUTER_API_KEY environment variable, or pass { apiKey } when constructing OpenRouterProvider.",
      );
    }

    const model = options.model ?? process.env.OPENROUTER_MODEL;
    if (!model) {
      throw new Error(
        'Missing OpenRouter model. Set the OPENROUTER_MODEL environment variable, or pass { model } when constructing OpenRouterProvider (e.g. "anthropic/claude-sonnet-5" - see the model catalog at https://openrouter.ai/models).',
      );
    }

    const baseURL = options.baseURL ?? process.env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL;

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
