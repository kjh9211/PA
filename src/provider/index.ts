/**
 * Provider package entry point. Re-exports the provider registry plus the
 * shared types relevant to providers, so consumers can import everything
 * they need from "../provider/index.js" if they prefer.
 */

export type { ProviderFactory } from "./registry.js";
export { ProviderRegistry, defaultRegistry } from "./registry.js";

export type {
  ReviewProvider,
  RawReview,
  RawReviewPayload,
  RawReviewIssue,
  ReviewContext,
} from "../shared/types.js";
