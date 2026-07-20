/**
 * Gemini provider - talks to Google's OpenAI-compatible endpoint for
 * Gemini models at https://generativelanguage.googleapis.com/v1beta/openai/.
 * Delegates the actual request/response handling to the shared
 * OpenAI-compatible reviewer.
 */

import { createOpenAICompatibleReviewer } from "../shared/openaiCompatibleProvider.js";
import type { RawReview, ReviewContext, ReviewProvider } from "../shared/types.js";

export const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  maxOutputTokens?: number;
}

export class GeminiProvider implements ReviewProvider {
  readonly name = "gemini" as const;

  private readonly delegate: ReviewProvider;

  constructor(options: GeminiProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing Gemini API key. Set the GEMINI_API_KEY environment variable, or pass { apiKey } when constructing GeminiProvider.",
      );
    }

    const model = options.model ?? process.env.GEMINI_MODEL;
    if (!model) {
      throw new Error(
        'Missing Gemini model. Set the GEMINI_MODEL environment variable, or pass { model } when constructing GeminiProvider (e.g. "gemini-2.5-flash").',
      );
    }

    const baseURL = options.baseURL ?? process.env.GEMINI_BASE_URL ?? DEFAULT_GEMINI_BASE_URL;

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
