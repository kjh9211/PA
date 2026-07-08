/**
 * Core review pipeline: Git Analyzer -> Context Builder -> Prompt Builder ->
 * Provider -> Normalizer.
 *
 * Core is intentionally provider-agnostic: it only ever talks to the
 * ReviewProvider interface, never to a concrete provider implementation.
 * Callers (the CLI) are responsible for constructing a provider and handing
 * it in - swapping providers never requires a change here.
 */
import { buildContext } from "../context-engine/index.js";
import { GitAnalyzer } from "../git/index.js";
import { normalize } from "../normalizer/index.js";
import { buildPrompt } from "../prompt/index.js";
import type {
  ContextBudgetConfig,
  GitChange,
  ReviewLevel,
  ReviewProvider,
  ReviewResult,
  ReviewType,
} from "../shared/types.js";

export class NoChangesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoChangesError";
  }
}

export type ReviewStage = "analyzing" | "context" | "reviewing";

export interface RunReviewOptions {
  cwd?: string;
  /** review this commit's changes instead of the staged index */
  commit?: string;
  level: ReviewLevel;
  type: ReviewType;
  provider: ReviewProvider;
  budget?: Partial<ContextBudgetConfig>;
  /** invoked right before each pipeline stage starts, for CLI progress output */
  onStage?: (stage: ReviewStage) => void;
}

export async function runReview(options: RunReviewOptions): Promise<ReviewResult> {
  options.onStage?.("analyzing");

  const git = new GitAnalyzer({ cwd: options.cwd });
  const repoRoot = await git.getRepoRoot();

  const changedFiles: GitChange[] = options.commit
    ? await git.getCommitChanges(options.commit)
    : await git.getStagedChanges();

  if (changedFiles.length === 0) {
    throw new NoChangesError(
      options.commit
        ? `No changes found in commit "${options.commit}".`
        : "No staged changes to review. Stage changes with `git add`, or pass --commit <ref> to review a specific commit.",
    );
  }

  options.onStage?.("context");

  const context = await buildContext(changedFiles, {
    repoRoot,
    level: options.level,
    type: options.type,
    budget: options.budget,
  });

  context.prompt = buildPrompt(context);

  options.onStage?.("reviewing");

  const raw = await options.provider.review(context);

  return normalize(raw, { changedFiles });
}
