/**
 * Normalizer - turns an untrusted RawReview (produced by a provider) into a
 * trustworthy ReviewResult. Nothing from the raw payload is trusted blindly:
 * every field is coerced/clamped/defaulted before it reaches the rest of the
 * system.
 */
import type {
  GitChange,
  RawReview,
  RawReviewIssue,
  ReviewIssue,
  ReviewResult,
  ReviewScore,
  ReviewStats,
  Severity,
  IssueCategory,
} from "../shared/types.js";

export interface NormalizeOptions {
  changedFiles: GitChange[];
}

const SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low"];
const CATEGORIES: readonly IssueCategory[] = [
  "security",
  "performance",
  "architecture",
  "style",
  "bug",
];

const DEFAULT_SEVERITY: Severity = "low";
const DEFAULT_CATEGORY: IssueCategory = "bug";

function coerceSeverity(value: unknown): Severity {
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    const match = SEVERITIES.find((severity) => severity === lowered);
    if (match) {
      return match;
    }
  }
  return DEFAULT_SEVERITY;
}

function coerceCategory(value: unknown): IssueCategory {
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    const match = CATEGORIES.find((category) => category === lowered);
    if (match) {
      return match;
    }
  }
  return DEFAULT_CATEGORY;
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
}

function clampLine(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function defaultString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function slugifyFile(file: string): string {
  return file.replace(/[^a-zA-Z0-9]+/g, "-");
}

function buildIssueId(provider: string, index: number, file: string, line: number): string {
  return `${provider}-${index}-${slugifyFile(file)}-${line}`;
}

function normalizeIssue(raw: RawReviewIssue, index: number, provider: string): ReviewIssue {
  const file = defaultString(raw?.file);
  const line = clampLine(raw?.line);

  return {
    id: buildIssueId(provider, index, file, line),
    severity: coerceSeverity(raw?.severity),
    category: coerceCategory(raw?.category),
    title: defaultString(raw?.title),
    description: defaultString(raw?.description),
    file,
    line,
    suggestion: defaultString(raw?.suggestion),
    confidence: clampConfidence(raw?.confidence),
    provider,
  };
}

function computeScore(issues: ReviewIssue[]): ReviewScore {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const issue of issues) {
    counts[issue.severity] += 1;
  }

  const overall = Math.min(
    100,
    Math.max(0, 100 - counts.critical * 30 - counts.high * 15 - counts.medium * 5 - counts.low * 1)
  );

  return {
    overall,
    critical: counts.critical,
    high: counts.high,
    medium: counts.medium,
    low: counts.low,
  };
}

function computeStats(raw: RawReview, options: NormalizeOptions): ReviewStats {
  const changedFiles = options.changedFiles;
  const linesAdded = changedFiles.reduce((sum, file) => sum + file.additions, 0);
  const linesRemoved = changedFiles.reduce((sum, file) => sum + file.deletions, 0);

  return {
    filesReviewed: changedFiles.length,
    linesAdded,
    linesRemoved,
    durationMs: raw.durationMs,
    provider: raw.provider,
    model: raw.model,
  };
}

export function normalize(raw: RawReview, options: NormalizeOptions): ReviewResult {
  const rawIssues = raw.payload?.issues ?? [];
  const issues = rawIssues.map((rawIssue, index) => normalizeIssue(rawIssue, index, raw.provider));

  const score = computeScore(issues);
  const stats = computeStats(raw, options);
  const summary = raw.payload?.summary?.trim() || "No summary provided.";

  return {
    score,
    issues,
    summary,
    stats,
  };
}
