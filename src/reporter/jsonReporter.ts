/**
 * JSON report for a ReviewResult - machine-readable output.
 */
import type { ReviewResult } from "../shared/types.js";

export function reportJson(result: ReviewResult): void {
  console.log(JSON.stringify(result, null, 2));
}
