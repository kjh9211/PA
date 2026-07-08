/**
 * Context Budget Engine
 *
 * Context Builder operates on a TOKEN BUDGET, not a fixed depth. The git
 * diff itself is always included in full and its token cost is reserved off
 * the top; the budget only decides how many extra *related* files get
 * pulled in around it.
 */
import { estimateTokens } from "../shared/tokens.js";
import type { ContextBudgetConfig, RelatedFile } from "../shared/types.js";

export const DEFAULT_BUDGET: ContextBudgetConfig = {
  maxTokens: 12000,
  maxFiles: 15,
  reservedDiffTokens: 3000,
};

export function applyBudget(
  relatedFiles: RelatedFile[],
  diffText: string,
  budget: ContextBudgetConfig,
): { included: RelatedFile[]; truncated: boolean; tokenEstimate: number } {
  const diffTokens = Math.max(
    estimateTokens(diffText),
    budget.reservedDiffTokens,
  );

  const sorted = [...relatedFiles].sort((a, b) => b.score - a.score);

  const included: RelatedFile[] = [];
  let truncated = false;
  let includedTokens = 0;

  for (const candidate of sorted) {
    if (included.length + 1 > budget.maxFiles) {
      truncated = true;
      continue;
    }

    const candidateTokens = estimateTokens(candidate.content);
    const remaining = budget.maxTokens - diffTokens - includedTokens;

    if (candidateTokens > remaining) {
      truncated = true;
      continue;
    }

    included.push(candidate);
    includedTokens += candidateTokens;
  }

  return {
    included,
    truncated,
    tokenEstimate: diffTokens + includedTokens,
  };
}
