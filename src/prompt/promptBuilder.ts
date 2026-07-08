/**
 * Prompt Builder.
 *
 * Turns a fully-built ReviewContext (diff, changedFiles, relatedFiles, level,
 * type and projectRules already populated by the Context Builder) into a
 * { system, user } pair suitable for a ReviewProvider LLM call.
 *
 * This module is pure: buildPrompt() never mutates the ReviewContext it is
 * given, it only reads from it and returns a brand new BuiltPrompt.
 */

import type {
  BuiltPrompt,
  GitChange,
  RelatedFile,
  ReviewContext,
  ReviewLevel,
  ReviewType,
} from "../shared/types.js";

const MAX_RELATED_FILE_CHARS = 20000;
const TRUNCATION_MARKER = "...[truncated]";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const LEVEL_EXPLANATIONS: Record<ReviewLevel, string> = {
  fast:
    "This is a FAST review: only the diff and the changed files were provided, " +
    "with no wider project context. Be conservative about any claim that would " +
    "require more context than what you were given.",
  normal:
    "This is a NORMAL review: related files pulled in via import dependencies " +
    "were included in addition to the diff and changed files, so you have some " +
    "surrounding context to reason about call sites and usages.",
  deep:
    "This is a DEEP review: related files, tests and project configuration were " +
    "included, so architecture and consistency observations are more reliable " +
    "and can be made with higher confidence.",
};

function buildSystemPrompt(context: ReviewContext): string {
  const levelExplanation = LEVEL_EXPLANATIONS[context.level];

  return [
    "You are a rigorous senior code reviewer performing a pre-merge review of a git diff.",
    "Only report issues you can support with evidence from the diff or the provided related files. " +
      "Never invent file paths or line numbers that are not present in what was given to you.",
    "Be concise and specific. Prefer a small number of well-supported issues over a large number of speculative ones.",
    "Calibrate your confidence (0-1) honestly for every issue you report, rather than defaulting to 1.",
    `The review level for this request is "${context.level}". ${levelExplanation}`,
    "You MUST produce your reply only via a call to the submit_review tool. Do not reply with free text.",
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// User prompt sections
// ---------------------------------------------------------------------------

const REVIEW_TYPE_PARAGRAPHS: Record<ReviewType, string> = {
  general:
    "This is a general review: look broadly across correctness, security, performance, " +
    "architecture and style. Other categories may also be reported if clearly relevant.",
  security:
    "This is a security-focused review: focus specifically on injection vulnerabilities, " +
    "authentication/authorization gaps, exposed secrets or credentials, unsafe deserialization, " +
    "and cryptography misuse. Other categories may still be reported if clearly relevant.",
  performance:
    "This is a performance-focused review: focus on algorithmic complexity, N+1 patterns, " +
    "unnecessary allocations and blocking I/O. Other categories may still be reported if clearly relevant.",
  architecture:
    "This is an architecture-focused review: focus on coupling, layering violations, leaky " +
    "abstractions and interface design. Other categories may still be reported if clearly relevant.",
  style:
    "This is a style-focused review: focus on readability, naming, and consistency with the " +
    "surrounding code. Other categories may still be reported if clearly relevant.",
};

function buildReviewTypeSection(type: ReviewType): string {
  return `## Review Type\n\n${REVIEW_TYPE_PARAGRAPHS[type]}`;
}

function buildProjectRulesSection(projectRules: string | undefined): string {
  const content =
    projectRules && projectRules.length > 0
      ? projectRules
      : "No project-specific rules provided; apply general best practices.";
  return `## Project Rules\n\n${content}`;
}

function buildKnownIssuesSection(): string {
  // Placeholder for the future Review Memory feature (see TOBE.md section 10).
  // Once Review Memory exists, this section will be populated with prior
  // known/resolved issues for the repository instead of this static text.
  return "## Known Issues\n\nNo prior review history is available for this repository yet.";
}

function buildGitDiffSection(diff: string): string {
  return `## Git Diff\n\n\`\`\`diff\n${diff}\n\`\`\``;
}

function buildChangedFilesSection(changedFiles: GitChange[]): string {
  const lines = changedFiles.map((change) => `- (${change.status}) ${change.file}`);
  return `## Changed Files\n\n${lines.join("\n")}`;
}

function truncateContent(content: string): string {
  if (content.length <= MAX_RELATED_FILE_CHARS) {
    return content;
  }
  return content.slice(0, MAX_RELATED_FILE_CHARS) + TRUNCATION_MARKER;
}

function buildRelatedFilesSection(relatedFiles: RelatedFile[]): string {
  if (relatedFiles.length === 0) {
    return "## Related Files\n\nNo related files were included at this review level.";
  }

  const subsections = relatedFiles.map((related) => {
    const heading = `### ${related.file} (score: ${related.score}, ${related.reason})`;
    const body = truncateContent(related.content);
    return `${heading}\n\n\`\`\`\n${body}\n\`\`\``;
  });

  return `## Related Files\n\n${subsections.join("\n\n")}`;
}

function buildOutputSchemaSection(): string {
  return [
    "## Output Schema",
    "",
    "Your reply MUST be made only by calling the `submit_review` tool. Never reply as plain text.",
    "",
    "The tool call payload shape is:",
    "",
    "- `summary` (string): a 1-3 sentence overview of the change and the review.",
    "- `issues` (array of objects): zero or more findings. Each issue object has:",
    "  - `severity`: one of `critical`, `high`, `medium`, `low`.",
    "  - `category`: one of `security`, `performance`, `architecture`, `style`, `bug`.",
    "  - `title`: a short title for the issue.",
    "  - `description`: a detailed explanation of the issue.",
    "  - `file`: the file path the issue applies to.",
    "  - `line`: the line number (a number) the issue applies to.",
    "  - `suggestion`: a concrete suggestion for how to address the issue.",
    "  - `confidence`: a number between 0 and 1 expressing how confident you are in this issue.",
    "",
    "`file` must be exactly one of the changed or related file paths given above. `line` should " +
      "correspond to a line actually touched in the diff whenever possible.",
    "",
    "An empty `issues` array is a valid and expected response when the change looks fine.",
  ].join("\n");
}

function buildUserPrompt(context: ReviewContext): string {
  const sections = [
    buildReviewTypeSection(context.type),
    buildProjectRulesSection(context.projectRules),
    buildKnownIssuesSection(),
    buildGitDiffSection(context.diff),
    buildChangedFilesSection(context.changedFiles),
    buildRelatedFilesSection(context.relatedFiles),
    buildOutputSchemaSection(),
  ];

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the { system, user } prompt pair for a ReviewProvider LLM call from
 * a fully-built ReviewContext. Pure function: does not mutate `context`.
 */
export function buildPrompt(context: ReviewContext): BuiltPrompt {
  return {
    system: buildSystemPrompt(context),
    user: buildUserPrompt(context),
  };
}
