/**
 * CLI composition root.
 *
 * This is the only place in the project that wires a concrete provider
 * (ClaudeProvider) into the provider-agnostic Core pipeline. Adding a new
 * provider later means registering it here - runReview() in core never
 * changes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

import { NoChangesError, runReview, type ReviewStage } from "../core/index.js";
import { isGitRepository } from "../git/index.js";
import { ProviderRegistry } from "../provider/index.js";
import { ClaudeProvider, type ClaudeProviderOptions } from "../provider-anthropic/index.js";
import { isMergeReady, reportConsole, reportJson } from "../reporter/index.js";
import { colors } from "../shared/colors.js";
import type { ReviewLevel, ReviewType } from "../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"),
) as { version: string };

const REVIEW_LEVELS: readonly ReviewLevel[] = ["fast", "normal", "deep"];
const REVIEW_TYPES: readonly ReviewType[] = [
  "general",
  "security",
  "performance",
  "architecture",
  "style",
];

const STAGE_MESSAGES: Record<ReviewStage, string> = {
  analyzing: "Analyzing Git Diff...",
  context: "Building Context...",
  reviewing: "Reviewing...",
};

function isReviewLevel(value: string): value is ReviewLevel {
  return (REVIEW_LEVELS as readonly string[]).includes(value);
}

function isReviewType(value: string): value is ReviewType {
  return (REVIEW_TYPES as readonly string[]).includes(value);
}

function buildProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(
    "claude",
    (config) => new ClaudeProvider(config as ClaudeProviderOptions | undefined),
  );
  return registry;
}

interface CliOptions {
  commit?: string;
  provider: string;
  level: string;
  type: string;
  json: boolean;
  fix: boolean;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("can-i-merge")
    .description("AI-powered Git Review Pipeline with Intelligent Context Building")
    .version(pkg.version)
    .option("--commit <ref>", "review a specific commit instead of the staged index")
    .option("--provider <name>", "AI provider to use", "claude")
    .option("--level <level>", "review level: fast, normal, or deep", "normal")
    .option(
      "--type <type>",
      "review focus: general, security, performance, architecture, or style",
      "general",
    )
    .option("--json", "output the review result as JSON", false)
    .option("--fix", "automatically apply suggested fixes (not yet supported)", false);

  program.parse(argv);
  const opts = program.opts<CliOptions>();

  if (opts.fix) {
    console.error(colors.yellow("--fix is not supported yet (see TOBE.md roadmap, Phase 4)."));
    process.exitCode = 2;
    return;
  }

  if (!isReviewLevel(opts.level)) {
    console.error(
      colors.red(`Invalid --level "${opts.level}". Expected one of: ${REVIEW_LEVELS.join(", ")}.`),
    );
    process.exitCode = 2;
    return;
  }

  if (!isReviewType(opts.type)) {
    console.error(
      colors.red(`Invalid --type "${opts.type}". Expected one of: ${REVIEW_TYPES.join(", ")}.`),
    );
    process.exitCode = 2;
    return;
  }

  const cwd = process.cwd();
  if (!(await isGitRepository(cwd))) {
    console.error(colors.red(`Not a git repository: ${cwd}`));
    process.exitCode = 2;
    return;
  }

  const registry = buildProviderRegistry();

  let provider;
  try {
    provider = registry.create(opts.provider);
  } catch (err) {
    console.error(colors.red(err instanceof Error ? err.message : String(err)));
    process.exitCode = 2;
    return;
  }

  if (!opts.json) {
    console.log(colors.bold(`can-i-merge v${pkg.version}`));
  }

  try {
    const result = await runReview({
      cwd,
      commit: opts.commit,
      level: opts.level,
      type: opts.type,
      provider,
      onStage: opts.json
        ? undefined
        : (stage) => console.log(STAGE_MESSAGES[stage]),
    });

    if (opts.json) {
      reportJson(result);
    } else {
      reportConsole(result);
    }

    process.exitCode = isMergeReady(result.score) ? 0 : 1;
  } catch (err) {
    if (err instanceof NoChangesError) {
      console.error(colors.yellow(err.message));
      process.exitCode = 0;
      return;
    }
    console.error(colors.red(err instanceof Error ? err.message : String(err)));
    process.exitCode = 2;
  }
}
