/**
 * Context Score Engine
 *
 * Converts raw dependency candidates into scored RelatedFile entries. The
 * score favors files that are close to the diff (small distance) and files
 * that are referenced by multiple changed files.
 */
import type { RelatedFile } from "../shared/types.js";
import type { DependencyCandidate } from "./dependencyResolver.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function scoreCandidates(
  candidates: DependencyCandidate[],
): RelatedFile[] {
  return candidates.map((candidate) => {
    const proximityScore = Math.max(
      10,
      100 - (candidate.distance - 1) * 30,
    );
    const referenceBonus = Math.min(candidate.referencedBy.length, 5) * 5;
    const score = clamp(proximityScore + referenceBonus, 0, 100);

    const reason = candidate.referencedBy.length
      ? `referenced by ${candidate.referencedBy.join(", ")}`
      : "related file";

    return {
      file: candidate.file,
      content: candidate.content,
      reason,
      score,
    };
  });
}
