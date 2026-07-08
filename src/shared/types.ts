/**
 * Shared type contract for can-i-merge.
 *
 * Every package (git, context-engine, prompt, provider, provider-anthropic,
 * normalizer, reporter, core, cli) imports from here and only from here when
 * talking to another package. No package should import another package's
 * internal types directly - this file is the seam that keeps Core, Provider
 * and Context Builder decoupled (see TOBE.md section 17).
 */

// ---------------------------------------------------------------------------
// Git Analyzer
// ---------------------------------------------------------------------------

export type ChangeStatus = "added" | "modified" | "deleted";

export interface GitChange {
  file: string;
  status: ChangeStatus;
  diff: string;
  additions: number;
  deletions: number;
}

// ---------------------------------------------------------------------------
// Review level / type (CLI --level, --type)
// ---------------------------------------------------------------------------

export type ReviewLevel = "fast" | "normal" | "deep";

export type ReviewType =
  | "general"
  | "security"
  | "performance"
  | "architecture"
  | "style";

// ---------------------------------------------------------------------------
// Context Builder
// ---------------------------------------------------------------------------

export interface RelatedFile {
  file: string;
  content: string;
  /** human readable reason this file was pulled into context, e.g. "imported by src/auth/login.ts" */
  reason: string;
  score: number;
}

export interface ContextBudgetConfig {
  maxTokens: number;
  maxFiles: number;
  reservedDiffTokens: number;
}

export interface BuiltPrompt {
  system: string;
  user: string;
}

export interface ReviewContext {
  level: ReviewLevel;
  type: ReviewType;
  diff: string;
  changedFiles: GitChange[];
  relatedFiles: RelatedFile[];
  /** free-form project rules pulled from a can-i-merge config file, if present */
  projectRules?: string;
  /** populated by the Prompt Builder; undefined until buildPrompt() runs */
  prompt?: BuiltPrompt;
  budget: ContextBudgetConfig;
  meta: {
    tokenEstimate: number;
    truncated: boolean;
  };
}

// ---------------------------------------------------------------------------
// Review Issue / Result
// ---------------------------------------------------------------------------

export type Severity = "critical" | "high" | "medium" | "low";

export type IssueCategory =
  | "security"
  | "performance"
  | "architecture"
  | "style"
  | "bug";

export interface ReviewIssue {
  id: string;
  severity: Severity;
  category: IssueCategory;
  title: string;
  description: string;
  file: string;
  line: number;
  suggestion: string;
  confidence: number;
  provider: string;
}

export interface ReviewScore {
  overall: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface ReviewStats {
  filesReviewed: number;
  linesAdded: number;
  linesRemoved: number;
  durationMs: number;
  provider: string;
  model?: string;
}

export interface ReviewResult {
  score: ReviewScore;
  issues: ReviewIssue[];
  summary: string;
  stats: ReviewStats;
}

// ---------------------------------------------------------------------------
// Provider Layer
// ---------------------------------------------------------------------------

/** Shape a provider must produce before Normalizer sees it. Loosely typed
 * on purpose - it is the raw, not-yet-trusted output of an LLM. */
export interface RawReviewIssue {
  severity: string;
  category: string;
  title: string;
  description: string;
  file: string;
  line: number;
  suggestion: string;
  confidence: number;
}

export interface RawReviewPayload {
  summary: string;
  issues: RawReviewIssue[];
}

export interface RawReview {
  payload: RawReviewPayload;
  provider: string;
  model?: string;
  durationMs: number;
}

export interface ReviewProvider {
  readonly name: string;
  review(context: ReviewContext): Promise<RawReview>;
}
