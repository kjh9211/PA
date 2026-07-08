/**
 * Human-readable console report for a ReviewResult.
 */
import type { ReviewIssue, ReviewResult, ReviewScore, Severity } from "../shared/types.js";
import { colors } from "../shared/colors.js";

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const DIVIDER = colors.dim("-".repeat(60));

export function isMergeReady(score: ReviewScore): boolean {
  return score.critical === 0 && score.high === 0;
}

function colorForSeverity(severity: Severity): (text: string) => string {
  switch (severity) {
    case "critical":
    case "high":
      return colors.red;
    case "medium":
    case "low":
      return colors.yellow;
    default:
      return colors.dim;
  }
}

function formatSeverityLabel(severity: Severity): string {
  const colorize = colorForSeverity(severity);
  return colorize(colors.bold(severity.toUpperCase()));
}

function sortedIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function scoreColor(overall: number): (text: string) => string {
  if (overall >= 80) {
    return colors.green;
  }
  if (overall >= 50) {
    return colors.yellow;
  }
  return colors.red;
}

function printHeader(result: ReviewResult): void {
  console.log(DIVIDER);
  console.log(colors.bold("Overall Score"));
  const overallText = `${result.score.overall}/100`;
  console.log(scoreColor(result.score.overall)(colors.bold(overallText)));
  console.log("");
  console.log(colors.bold("Issue Breakdown"));
  console.log(
    `  ${colors.red(colors.bold("Critical"))}: ${colors.red(String(result.score.critical))}  ` +
      `${colors.red(colors.bold("High"))}: ${colors.red(String(result.score.high))}  ` +
      `${colors.yellow(colors.bold("Medium"))}: ${colors.yellow(String(result.score.medium))}  ` +
      `${colors.yellow(colors.bold("Low"))}: ${colors.yellow(String(result.score.low))}`
  );
}

function printIssue(issue: ReviewIssue, index: number, total: number): void {
  console.log(DIVIDER);
  console.log(
    `${colors.dim(`[${index + 1}/${total}]`)} ${formatSeverityLabel(issue.severity)} ` +
      colors.dim(`(${issue.category})`)
  );
  console.log(colors.bold(`${issue.file}:${issue.line}`));
  console.log(colors.bold(issue.title || "(untitled issue)"));
  if (issue.description) {
    console.log("");
    console.log(issue.description);
  }
  if (issue.suggestion) {
    console.log("");
    console.log(`${colors.dim("Recommendation:")} ${issue.suggestion}`);
  }
  console.log(colors.dim(`Confidence: ${(issue.confidence * 100).toFixed(0)}%`));
}

function printIssues(issues: ReviewIssue[]): void {
  if (issues.length === 0) {
    console.log(DIVIDER);
    console.log(colors.dim("No issues found."));
    return;
  }

  const ordered = sortedIssues(issues);
  ordered.forEach((issue, index) => printIssue(issue, index, ordered.length));
}

function printFooter(result: ReviewResult): void {
  console.log(DIVIDER);
  console.log(colors.bold("Summary"));
  console.log(result.summary);
  console.log("");

  const { stats } = result;
  console.log(colors.dim("Stats"));
  console.log(`  Files reviewed: ${stats.filesReviewed}`);
  console.log(
    `  Lines: ${colors.green(`+${stats.linesAdded}`)} ${colors.red(`-${stats.linesRemoved}`)}`
  );
  const modelSuffix = stats.model ? ` (${stats.model})` : "";
  console.log(`  Provider: ${stats.provider}${modelSuffix}`);
  console.log(`  Duration: ${stats.durationMs}ms`);

  console.log(DIVIDER);
  console.log(colors.bold("Merge Status"));
  if (isMergeReady(result.score)) {
    console.log(colors.green(colors.bold("✅ READY")));
  } else {
    console.log(colors.red(colors.bold("❌ NOT READY")));
  }
  console.log(DIVIDER);
}

export function reportConsole(result: ReviewResult): void {
  printHeader(result);
  printIssues(result.issues);
  printFooter(result);
}
