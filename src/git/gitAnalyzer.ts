/**
 * Git Analyzer
 *
 * Turns git repository state into GitChange[] records (see shared/types.ts).
 * All git invocations use node:child_process execFile with argument arrays -
 * never a shell string with interpolated paths - to avoid command injection.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChangeStatus, GitChange } from "../shared/types.js";

const execFileAsync = promisify(execFile);

/** Git's magic empty-tree object id, used as a diff base for root commits. */
const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** Max buffer size for git command output (diffs can be large). */
const MAX_BUFFER = 1024 * 1024 * 64; // 64 MB

export interface GitAnalyzerOptions {
  cwd?: string;
}

interface NameStatusEntry {
  status: ChangeStatus;
  path: string;
}

interface NumstatEntry {
  additions: number;
  deletions: number;
  path: string;
}

export class GitAnalyzer {
  private readonly cwd: string;
  private repoRoot: string | undefined;

  constructor(options?: GitAnalyzerOptions) {
    this.cwd = options?.cwd ?? process.cwd();
  }

  /**
   * Resolves the top-level directory of the git repository containing `cwd`.
   * Result is cached and used as the working directory for all subsequent
   * git invocations from this instance.
   */
  async getRepoRoot(): Promise<string> {
    if (this.repoRoot !== undefined) {
      return this.repoRoot;
    }

    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--show-toplevel"],
        { cwd: this.cwd, maxBuffer: MAX_BUFFER }
      );
      const root = stdout.trim();
      this.repoRoot = root;
      return root;
    } catch {
      throw new Error(
        `Not a git repository (or any of the parent directories): ${this.cwd}`
      );
    }
  }

  /** Diff of the index (staged changes) vs HEAD. */
  async getStagedChanges(): Promise<GitChange[]> {
    return this.getChangesForArgs(["--staged"]);
  }

  /**
   * Diff of `ref` against its parent. If `ref` has no parent (root commit),
   * diffs against git's empty-tree object instead.
   */
  async getCommitChanges(ref: string): Promise<GitChange[]> {
    const root = await this.getRepoRoot();
    const base = await this.resolveParent(root, ref);
    return this.getChangesForArgs([`${base}..${ref}`]);
  }

  /**
   * Diff of `head` (defaults to "HEAD") against `base` using three-dot
   * (merge-base) semantics.
   */
  async getBranchChanges(base: string, head = "HEAD"): Promise<GitChange[]> {
    return this.getChangesForArgs([`${base}...${head}`]);
  }

  /** Checks whether `${ref}~1` resolves; falls back to the empty tree sha. */
  private async resolveParent(root: string, ref: string): Promise<string> {
    try {
      await execFileAsync(
        "git",
        ["rev-parse", "--verify", `${ref}~1`],
        { cwd: root, maxBuffer: MAX_BUFFER }
      );
      return `${ref}~1`;
    } catch {
      return EMPTY_TREE_SHA;
    }
  }

  /**
   * Shared implementation for all three change-listing methods: resolves
   * name-status + numstat + per-file diff text for the given git diff args.
   */
  private async getChangesForArgs(diffArgs: string[]): Promise<GitChange[]> {
    const root = await this.getRepoRoot();

    const [nameStatusEntries, numstatEntries] = await Promise.all([
      this.getNameStatus(root, diffArgs),
      this.getNumstat(root, diffArgs),
    ]);

    if (nameStatusEntries.length === 0) {
      return [];
    }

    const numstatByPath = new Map<string, NumstatEntry>();
    for (const entry of numstatEntries) {
      numstatByPath.set(entry.path, entry);
    }

    const changes = await Promise.all(
      nameStatusEntries.map(async (entry) => {
        const numstat = numstatByPath.get(entry.path);
        const diff = await this.getFileDiff(root, diffArgs, entry.path);
        const change: GitChange = {
          file: entry.path,
          status: entry.status,
          diff,
          additions: numstat?.additions ?? 0,
          deletions: numstat?.deletions ?? 0,
        };
        return change;
      })
    );

    return changes;
  }

  private async getNameStatus(
    root: string,
    diffArgs: string[]
  ): Promise<NameStatusEntry[]> {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--name-status", ...diffArgs],
      { cwd: root, maxBuffer: MAX_BUFFER }
    );

    const entries: NameStatusEntry[] = [];
    const lines = stdout.split("\n").filter((line) => line.trim() !== "");

    for (const line of lines) {
      const fields = line.split("\t");
      const rawStatus = fields[0] ?? "";

      let status: ChangeStatus;
      let path: string;

      if (rawStatus.startsWith("R")) {
        // Rename: old\tnew - use the new path.
        status = "modified";
        path = fields[2] ?? fields[1] ?? "";
      } else if (rawStatus.startsWith("C")) {
        // Copy: old\tnew - treat as added, use the new path.
        status = "added";
        path = fields[2] ?? fields[1] ?? "";
      } else if (rawStatus === "A") {
        status = "added";
        path = fields[1] ?? "";
      } else if (rawStatus === "D") {
        status = "deleted";
        path = fields[1] ?? "";
      } else if (rawStatus === "M") {
        status = "modified";
        path = fields[1] ?? "";
      } else {
        status = "modified";
        path = fields[1] ?? "";
      }

      if (path !== "") {
        entries.push({ status, path });
      }
    }

    return entries;
  }

  private async getNumstat(
    root: string,
    diffArgs: string[]
  ): Promise<NumstatEntry[]> {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--numstat", ...diffArgs],
      { cwd: root, maxBuffer: MAX_BUFFER }
    );

    const entries: NumstatEntry[] = [];
    const lines = stdout.split("\n").filter((line) => line.trim() !== "");

    for (const line of lines) {
      const fields = line.split("\t");
      const rawAdditions = fields[0] ?? "0";
      const rawDeletions = fields[1] ?? "0";
      // Rename lines from numstat look like: add\tdel\told => new or old\tnew
      // depending on git version/config; the last field holds the path info.
      const rawPath = fields[2] ?? "";

      const additions = rawAdditions === "-" ? 0 : Number.parseInt(rawAdditions, 10) || 0;
      const deletions = rawDeletions === "-" ? 0 : Number.parseInt(rawDeletions, 10) || 0;
      const path = this.extractNumstatPath(rawPath);

      if (path !== "") {
        entries.push({ additions, deletions, path });
      }
    }

    return entries;
  }

  /**
   * Numstat rename paths can appear as "old => new" or "{old => new}/rest".
   * Normalizes to the new path so it matches the name-status entry's path.
   */
  private extractNumstatPath(rawPath: string): string {
    if (!rawPath.includes("=>")) {
      return rawPath;
    }

    const braceMatch = rawPath.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
    if (braceMatch) {
      const [, prefix, , after, suffix] = braceMatch;
      return `${prefix ?? ""}${after ?? ""}${suffix ?? ""}`;
    }

    const parts = rawPath.split(" => ");
    return (parts[parts.length - 1] ?? rawPath).trim();
  }

  private async getFileDiff(
    root: string,
    diffArgs: string[],
    path: string
  ): Promise<string> {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", ...diffArgs, "--", path],
      { cwd: root, maxBuffer: MAX_BUFFER }
    );
    return stdout;
  }
}

/** Checks whether `cwd` (default: process.cwd()) is inside a git repository. */
export async function isGitRepository(cwd?: string): Promise<boolean> {
  const resolvedCwd = cwd ?? process.cwd();
  try {
    await execFileAsync(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      { cwd: resolvedCwd, maxBuffer: MAX_BUFFER }
    );
    return true;
  } catch {
    return false;
  }
}
