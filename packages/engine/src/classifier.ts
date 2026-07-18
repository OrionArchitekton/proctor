import type { TestReport, DriftVerdict } from "@proctor/shared";
import { isInvariantId } from "./invariants.js";
import { SEMANTIC_SIMILARITY_THRESHOLD, FLAKY_TOLERANCE } from "./config.js";

// ── public types ───────────────────────────────────────────────────────────

export type ReasonDrift = (report: TestReport, baseline: TestReport) => Promise<DriftVerdict>;

export interface ClassifyDeps {
  reason: ReasonDrift;
}

// ── classifier ─────────────────────────────────────────────────────────────

/**
 * Classifies drift between a failing report and its baseline.
 *
 * Rules (evaluated in order — LLM is only called if no rule fires):
 *   1. No failures → flaky (defensive; classifier normally called on failures).
 *   2. Any failure is an invariant id → real-regression (deterministic guarantee broken).
 *   3. ALL failures are semantic AND every score >= threshold - tolerance → flaky.
 *   4. Otherwise → delegate to deps.reason (LLM decision).
 */
export async function classifyDrift(
  report: TestReport,
  baseline: TestReport,
  deps: ClassifyDeps,
): Promise<DriftVerdict> {
  const failures = report.results.filter((r) => !r.passed);

  // Rule 1 — defensive: no failures
  if (failures.length === 0) {
    return { kind: "flaky", rationale: "no assertion failures" };
  }

  // Rule 2 — invariant violated (deterministic; LLM must not override)
  // De-duplicate: one invariant can fail across several offending rows, and the
  // rationale should name it once, not once per failing result.
  const failedInvariantIds = [
    ...new Set(
      failures.filter((r) => isInvariantId(r.field)).map((r) => r.field),
    ),
  ];

  if (failedInvariantIds.length > 0) {
    return {
      kind: "real-regression",
      rationale: `invariant violated: ${failedInvariantIds.join(", ")}`,
    };
  }

  // Rule 3 — all semantic and every score within the flaky tolerance window
  const floor = SEMANTIC_SIMILARITY_THRESHOLD - FLAKY_TOLERANCE;
  const allSemanticAndBorderline =
    failures.every((r) => r.kind === "semantic") &&
    failures.every((r) => typeof r.score === "number" && r.score >= floor);

  if (allSemanticAndBorderline) {
    return {
      kind: "flaky",
      rationale: "semantic scores within flaky tolerance of threshold",
    };
  }

  // Rule 4 — delegate to LLM
  return deps.reason(report, baseline);
}
