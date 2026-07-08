/**
 * NVIDIA provider - talks to NVIDIA's OpenAI-chat-completions-compatible
 * endpoint for NIM-hosted foundation models (e.g. Llama, Nemotron) at
 * https://integrate.api.nvidia.com/v1. Delegates the actual request/response
 * handling to the shared OpenAI-compatible reviewer.
 */

import { createOpenAICompatibleReviewer } from "../shared/openaiCompatibleProvider.js";
import type { RawReview, ReviewContext, ReviewProvider } from "../shared/types.js";

export const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export interface NvidiaProviderOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  maxOutputTokens?: number;
}

export class NvidiaProvider implements ReviewProvider {
  readonly name = "nvidia" as const;

  private readonly delegate: ReviewProvider;

  constructor(options: NvidiaProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing NVIDIA API key. Set the NVIDIA_API_KEY environment variable, or pass { apiKey } when constructing NvidiaProvider.",
      );
    }

    const model = options.model ?? process.env.NVIDIA_MODEL;
    if (!model) {
      throw new Error(
        'Missing NVIDIA model. Set the NVIDIA_MODEL environment variable, or pass { model } when constructing NvidiaProvider (e.g. "meta/llama-3.1-70b-instruct" - see the model catalog at https://build.nvidia.com).',
      );
    }

    const baseURL = options.baseURL ?? process.env.NVIDIA_BASE_URL ?? DEFAULT_NVIDIA_BASE_URL;

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
