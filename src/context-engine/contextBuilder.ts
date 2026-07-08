/**
 * Context Builder - main entry point for the Context Engine.
 *
 * Orchestrates dependency resolution, scoring and budgeting to produce a
 * ReviewContext for the Prompt Builder. The git diff is always included in
 * full; the token budget only governs how many extra related files are
 * pulled in around it.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { estimateTokens } from "../shared/tokens.js";
import type {
  ContextBudgetConfig,
  GitChange,
  RelatedFile,
  ReviewContext,
  ReviewLevel,
  ReviewType,
} from "../shared/types.js";
import { applyBudget, DEFAULT_BUDGET } from "./contextBudgetEngine.js";
import { scoreCandidates } from "./contextScoreEngine.js";
import { resolveDependencies } from "./dependencyResolver.js";

export interface ContextBuilderOptions {
  repoRoot: string;
  level: ReviewLevel;
  type: ReviewType;
  budget?: Partial<ContextBudgetConfig>;
  projectRules?: string;
}

const TEST_EXTENSION_SUFFIXES = [
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
];

const ROOT_CONFIG_FILES = [
  "tsconfig.json",
  "package.json",
  ".eslintrc.json",
  ".eslintrc.cjs",
  ".eslintrc.js",
];

const MAX_CONFIG_FILE_BYTES = 50_000;

function toPosixPath(p: string): string {
  return p.split(path.sep).join("/");
}

async function readFileIfSmallEnough(
  absPath: string,
  maxBytes: number,
): Promise<string | undefined> {
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) return undefined;
    if (stat.size > maxBytes) return undefined;
    return await fs.readFile(absPath, "utf8");
  } catch {
    return undefined;
  }
}

function stripKnownExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext ? filePath.slice(0, -ext.length) : filePath;
}

async function findTestFileFor(
  changedFile: string,
  repoRoot: string,
): Promise<RelatedFile | undefined> {
  const base = stripKnownExtension(changedFile);
  const dir = path.dirname(changedFile);
  const baseName = path.basename(base);

  const candidateRelPaths: string[] = [];

  for (const suffix of TEST_EXTENSION_SUFFIXES) {
    candidateRelPaths.push(toPosixPath(base + suffix));
  }

  for (const suffix of TEST_EXTENSION_SUFFIXES) {
    candidateRelPaths.push(
      toPosixPath(path.join(dir, "__tests__", baseName + suffix)),
    );
  }

  for (const relPath of candidateRelPaths) {
    if (relPath === changedFile) continue;
    const absPath = path.join(repoRoot, relPath);
    const content = await readFileIfSmallEnough(absPath, 200_000);
    if (content !== undefined) {
      return {
        file: relPath,
        content,
        reason: `test file for ${changedFile}`,
        score: 65,
      };
    }
  }

  return undefined;
}

async function gatherDeepExtras(
  changedFiles: GitChange[],
  repoRoot: string,
  existingFiles: Set<string>,
): Promise<RelatedFile[]> {
  const extras: RelatedFile[] = [];
  const seen = new Set<string>(existingFiles);

  for (const changed of changedFiles) {
    if (changed.status === "deleted") continue;
    const testFile = await findTestFileFor(changed.file, repoRoot);
    if (testFile && !seen.has(testFile.file)) {
      extras.push(testFile);
      seen.add(testFile.file);
    }
  }

  for (const configFile of ROOT_CONFIG_FILES) {
    if (seen.has(configFile)) continue;
    const absPath = path.join(repoRoot, configFile);
    const content = await readFileIfSmallEnough(
      absPath,
      MAX_CONFIG_FILE_BYTES,
    );
    if (content !== undefined) {
      extras.push({
        file: configFile,
        content,
        reason: "project config",
        score: 55,
      });
      seen.add(configFile);
    }
  }

  return extras;
}

async function loadProjectRules(
  repoRoot: string,
): Promise<string | undefined> {
  try {
    const configPath = path.join(repoRoot, "can-i-merge.config.json");
    const configContent = await readFileIfSmallEnough(
      configPath,
      MAX_CONFIG_FILE_BYTES,
    );
    if (configContent !== undefined) {
      const parsed: unknown = JSON.parse(configContent);
      if (
        parsed &&
        typeof parsed === "object" &&
        "rules" in parsed &&
        typeof (parsed as { rules?: unknown }).rules === "string"
      ) {
        return (parsed as { rules: string }).rules;
      }
    }
  } catch {
    // fall through to next strategy - malformed config should not throw
  }

  try {
    const rulesPath = path.join(repoRoot, ".can-i-merge", "rules.md");
    const rulesContent = await fs.readFile(rulesPath, "utf8");
    return rulesContent;
  } catch {
    return undefined;
  }
}

export async function buildContext(
  changedFiles: GitChange[],
  options: ContextBuilderOptions,
): Promise<ReviewContext> {
  const budget: ContextBudgetConfig = { ...DEFAULT_BUDGET, ...options.budget };
  const diff = changedFiles.map((c) => c.diff).join("\n\n");

  let scored: RelatedFile[] = [];

  if (options.level !== "fast") {
    const maxDepth = options.level === "deep" ? 3 : 2;
    const candidates = await resolveDependencies(changedFiles, options.repoRoot, {
      maxDepth,
    });
    scored = scoreCandidates(candidates);

    if (options.level === "deep") {
      const existingFiles = new Set(scored.map((f) => f.file));
      const extras = await gatherDeepExtras(
        changedFiles,
        options.repoRoot,
        existingFiles,
      );
      scored = [...scored, ...extras];
    }
  }

  let relatedFiles: RelatedFile[];
  let tokenEstimate: number;
  let truncated: boolean;

  if (options.level !== "fast") {
    const budgetResult = applyBudget(scored, diff, budget);
    relatedFiles = budgetResult.included;
    tokenEstimate = budgetResult.tokenEstimate;
    truncated = budgetResult.truncated;
  } else {
    relatedFiles = [];
    tokenEstimate = estimateTokens(diff);
    truncated = false;
  }

  let projectRules: string | undefined;
  if (options.projectRules !== undefined) {
    projectRules = options.projectRules;
  } else {
    projectRules = await loadProjectRules(options.repoRoot);
  }

  return {
    level: options.level,
    type: options.type,
    diff,
    changedFiles,
    relatedFiles,
    projectRules,
    prompt: undefined,
    budget,
    meta: {
      tokenEstimate,
      truncated,
    },
  };
}
