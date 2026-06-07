import type { Contract, SutRef, AssertionResult, TestReport } from "@proctor/shared";
import {
  assertExact,
  assertSemantic,
  type SemanticJudge,
} from "./assertions.js";
import { checkInvariants } from "./invariants.js";
import { SEMANTIC_SIMILARITY_THRESHOLD } from "./config.js";

export interface RunDeps {
  runSut: (sut: SutRef, input: unknown) => Promise<Record<string, unknown>>;
  judge: SemanticJudge;
}

/**
 * Presence-check for structural assertions.
 * Passes when the field exists and is not null/undefined.
 */
function assertPresent(field: string, value: unknown): AssertionResult {
  const passed = value !== undefined && value !== null;
  return {
    field,
    kind: "structural",
    passed,
    evidence: passed
      ? `${field} is present (${typeof value})`
      : `${field} is absent or null`,
  };
}

export async function runContract(
  sut: SutRef,
  contract: Contract,
  goldenInputs: unknown[],
  deps: RunDeps,
): Promise<TestReport> {
  const { runSut, judge } = deps;

  // Track first-seen values per field for exact/semantic baseline comparison.
  const firstSeen = new Map<string, unknown>();

  const allResults: AssertionResult[] = [];
  const rawOutputs: unknown[] = [];

  for (const input of goldenInputs) {
    const output = await runSut(sut, input);
    rawOutputs.push(output);

    for (const field of contract.fields) {
      const value = output[field.name];

      // Record the first-seen value on the first iteration.
      if (!firstSeen.has(field.name)) {
        firstSeen.set(field.name, value);
      }
      const baseline = firstSeen.get(field.name);

      let result: AssertionResult;

      switch (field.kind) {
        case "structural":
          result = assertPresent(field.name, value);
          break;

        case "exact":
          // Exact fields must equal the first-observed value across all runs.
          result = assertExact(field.name, value, baseline);
          break;

        case "semantic": {
          if (
            value === undefined ||
            value === null ||
            baseline === undefined ||
            baseline === null
          ) {
            // Missing value/baseline must fail — never coerce to "null"/"undefined"
            // strings, which would yield a false-positive semantic match.
            result = {
              field: field.name,
              kind: "semantic",
              passed: false,
              evidence: `value or baseline is missing (value=${String(
                value,
              )}, baseline=${String(baseline)})`,
            };
          } else {
            const effectiveThreshold =
              SEMANTIC_SIMILARITY_THRESHOLD - (field.tolerance ?? 0);
            result = await assertSemantic(
              field.name,
              String(baseline),
              String(value),
              judge,
              effectiveThreshold,
            );
          }
          break;
        }
      }

      allResults.push(result);
    }

    // Run invariant checks for this output.
    const invResults = checkInvariants(output, contract.invariants);
    allResults.push(...invResults);
  }

  const allPassed = allResults.every((r) => r.passed);

  return {
    sutId: sut.id,
    allPassed,
    results: allResults,
    rawOutputs,
  };
}
