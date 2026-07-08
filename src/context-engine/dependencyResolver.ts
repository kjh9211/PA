/**
 * Dependency Resolver
 *
 * BFS over the local (relative-import) module graph starting from every
 * non-deleted changed file. Discovers candidate files that are related to
 * the diff so the Context Score/Budget Engines can decide which of them are
 * worth including in the review context.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { GitChange } from "../shared/types.js";

export interface DependencyCandidate {
  file: string;
  content: string;
  distance: number;
  referencedBy: string[];
}

const MAX_FILE_BYTES = 200_000;

const IGNORED_DIR_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
]);

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"];
const INDEX_CANDIDATES = ["index.ts", "index.tsx", "index.js"];

// import ... from "..."; export ... from "..."; import "...";
const IMPORT_FROM_RE = /(?:import|export)(?:[^'";]*?)\bfrom\s*["']([^"']+)["']/g;
// bare side-effect import: import "...";
const IMPORT_BARE_RE = /import\s*["']([^"']+)["']/g;
// dynamic import("...")
const IMPORT_DYNAMIC_RE = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
// CommonJS require("...")
const REQUIRE_RE = /require\s*\(\s*["']([^"']+)["']\s*\)/g;

function extractSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const regexes = [
    IMPORT_FROM_RE,
    IMPORT_BARE_RE,
    IMPORT_DYNAMIC_RE,
    REQUIRE_RE,
  ];
  for (const re of regexes) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      const specifier = match[1];
      if (specifier) specifiers.add(specifier);
    }
  }
  return Array.from(specifiers);
}

function isIgnoredPath(relativePath: string): boolean {
  const segments = relativePath.split(/[\\/]/);
  return segments.some((segment) => IGNORED_DIR_SEGMENTS.has(segment));
}

async function fileExists(absPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(absPath);
    return stat.isFile();
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return false;
    return false;
  }
}

/**
 * Resolve a relative import specifier (found in `importingFileAbsDir`)
 * against candidate extensions / index files. Returns the resolved absolute
 * path, or undefined if nothing on disk matches.
 */
async function resolveRelativeSpecifier(
  importingFileAbsDir: string,
  specifier: string,
): Promise<string | undefined> {
  const basePath = path.resolve(importingFileAbsDir, specifier);

  // 1. exact path
  if (await fileExists(basePath)) return basePath;

  // 2. with extensions appended
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = basePath + ext;
    if (await fileExists(candidate)) return candidate;
  }

  // 3. as a directory with index files
  for (const indexFile of INDEX_CANDIDATES) {
    const candidate = path.join(basePath, indexFile);
    if (await fileExists(candidate)) return candidate;
  }

  return undefined;
}

async function readFileSafe(absPath: string): Promise<string | undefined> {
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) return undefined;
    if (stat.size > MAX_FILE_BYTES) return undefined;
    return await fs.readFile(absPath, "utf8");
  } catch {
    return undefined;
  }
}

export async function resolveDependencies(
  changedFiles: GitChange[],
  repoRoot: string,
  options: { maxDepth: number },
): Promise<DependencyCandidate[]> {
  const changedRelPaths = new Set(
    changedFiles.filter((c) => c.status !== "deleted").map((c) => c.file),
  );

  interface QueueItem {
    relPath: string;
    distance: number;
    /** relative path of the changed file that (transitively) led here */
    originChangedFile: string;
  }

  const queue: QueueItem[] = [];
  const visited = new Set<string>();
  const contentCache = new Map<string, string>();
  const candidates = new Map<string, DependencyCandidate>();

  for (const relPath of changedRelPaths) {
    if (isIgnoredPath(relPath)) continue;
    const absPath = path.join(repoRoot, relPath);
    const content = await readFileSafe(absPath);
    if (content === undefined) continue;
    contentCache.set(relPath, content);
    visited.add(relPath);
    queue.push({ relPath, distance: 0, originChangedFile: relPath });
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    if (current.distance >= options.maxDepth) continue;

    const currentContent = contentCache.get(current.relPath);
    if (currentContent === undefined) continue;

    const currentAbsDir = path.dirname(path.join(repoRoot, current.relPath));
    const specifiers = extractSpecifiers(currentContent);

    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) continue; // skip bare/package specifiers

      const resolvedAbs = await resolveRelativeSpecifier(
        currentAbsDir,
        specifier,
      );
      if (!resolvedAbs) continue;

      const relPath = path
        .relative(repoRoot, resolvedAbs)
        .split(path.sep)
        .join("/");

      if (isIgnoredPath(relPath)) continue;

      const nextDistance = current.distance + 1;
      const isChangedFileItself = changedRelPaths.has(relPath);

      if (!isChangedFileItself) {
        const existing = candidates.get(relPath);
        if (existing) {
          if (!existing.referencedBy.includes(current.originChangedFile)) {
            existing.referencedBy.push(current.originChangedFile);
          }
        } else {
          let content = contentCache.get(relPath);
          if (content === undefined) {
            const loaded = await readFileSafe(resolvedAbs);
            if (loaded === undefined) continue;
            content = loaded;
            contentCache.set(relPath, content);
          }
          candidates.set(relPath, {
            file: relPath,
            content,
            distance: nextDistance,
            referencedBy: [current.originChangedFile],
          });
        }
      }

      if (visited.has(relPath)) continue;
      visited.add(relPath);

      if (!contentCache.has(relPath)) {
        const content = await readFileSafe(resolvedAbs);
        if (content !== undefined) contentCache.set(relPath, content);
      }

      if (nextDistance <= options.maxDepth) {
        queue.push({
          relPath,
          distance: nextDistance,
          originChangedFile: current.originChangedFile,
        });
      }
    }
  }

  return Array.from(candidates.values());
}
