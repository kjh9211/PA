/**
 * OpenAI provider - implements ReviewProvider by delegating to the shared
 * OpenAI-compatible reviewer (createOpenAICompatibleReviewer), which speaks
 * the OpenAI chat-completions wire format and forces structured output via
 * a "submit_review" tool call.
 */

import { createOpenAICompatibleReviewer } from "../shared/openaiCompatibleProvider.js";
import type { RawReview, ReviewContext, ReviewProvider } from "../shared/types.js";

export interface OpenAIProviderOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  maxOutputTokens?: number;
}

export class OpenAIProvider implements ReviewProvider {
  readonly name = "openai" as const;

  private readonly delegate: ReviewProvider;

  constructor(options: OpenAIProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing OpenAI API key. Set the OPENAI_API_KEY environment variable, or pass { apiKey } when constructing OpenAIProvider.",
      );
    }

    const model = options.model ?? process.env.OPENAI_MODEL;
    if (!model) {
      throw new Error(
        'Missing OpenAI model. Set the OPENAI_MODEL environment variable, or pass { model } when constructing OpenAIProvider (e.g. "gpt-4.1").',
      );
    }

    const baseURL = options.baseURL ?? process.env.OPENAI_BASE_URL;

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
