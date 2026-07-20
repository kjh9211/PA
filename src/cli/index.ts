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

import { clearProviderConfig, loadProviderConfig, saveProviderConfig } from "../config/index.js";
import { NoChangesError, runReview, type ReviewStage } from "../core/index.js";
import { isGitRepository } from "../git/index.js";
import { ProviderRegistry } from "../provider/index.js";
import { ClaudeProvider, type ClaudeProviderOptions } from "../provider-anthropic/index.js";
import { NvidiaProvider, type NvidiaProviderOptions } from "../provider-nvidia/index.js";
import { OllamaProvider, type OllamaProviderOptions } from "../provider-ollama/index.js";
import { OpenAIProvider, type OpenAIProviderOptions } from "../provider-openai/index.js";
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

const PROVIDER_ENV_VARS: Record<string, { apiKey: string; model: string }> = {
  claude: { apiKey: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL" },
  openai: { apiKey: "OPENAI_API_KEY", model: "OPENAI_MODEL" },
  nvidia: { apiKey: "NVIDIA_API_KEY", model: "NVIDIA_MODEL" },
  ollama: { apiKey: "OLLAMA_API_KEY", model: "OLLAMA_MODEL" },
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
  registry.register(
    "openai",
    (config) => new OpenAIProvider(config as OpenAIProviderOptions | undefined),
  );
  registry.register(
    "nvidia",
    (config) => new NvidiaProvider(config as NvidiaProviderOptions | undefined),
  );
  registry.register(
    "ollama",
    (config) => new OllamaProvider(config as OllamaProviderOptions | undefined),
  );
  return registry;
}

interface CliOptions {
  commit?: string;
  provider: string;
  apiKey?: string;
  model?: string;
  forgetCredentials: boolean;
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
    .option("--provider <name>", "AI provider to use: claude, openai, nvidia, or ollama", "claude")
    .option(
      "--api-key <key>",
      "API key for the selected provider (saved encrypted for future runs)",
    )
    .option("--model <model>", "model name for the selected provider (saved for future runs)")
    .option(
      "--forget-credentials",
      "remove stored credentials for the selected provider and exit",
      false,
    )
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

  if (opts.forgetCredentials) {
    clearProviderConfig(opts.provider);
    console.log(colors.green(`Removed stored credentials for provider "${opts.provider}".`));
    return;
  }

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

  if (opts.apiKey !== undefined || opts.model !== undefined) {
    saveProviderConfig(opts.provider, { apiKey: opts.apiKey, model: opts.model });
    if (!opts.json) {
      console.log(
        colors.dim(`Saved ${opts.provider} credentials to ~/.can-i-merge (encrypted).`),
      );
    }
  }

  const stored = loadProviderConfig(opts.provider);
  const envVars = PROVIDER_ENV_VARS[opts.provider];
  const apiKey = opts.apiKey ?? (envVars && process.env[envVars.apiKey]) ?? stored.apiKey;
  const model = opts.model ?? (envVars && process.env[envVars.model]) ?? stored.model;

  const registry = buildProviderRegistry();

  let provider;
  try {
    provider = registry.create(opts.provider, { apiKey, model });
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
