/**
 * Rough token estimator shared by context-engine and provider-anthropic.
 *
 * There is no tokenizer dependency in this project on purpose - this is a
 * conservative heuristic (~4 chars/token, in line with published estimates
 * for English text and source code) used only for budget accounting, not for
 * exact billing.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
