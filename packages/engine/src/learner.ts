import type { Contract, FieldAssertion, SutRef } from "@proctor/shared";
import { INVARIANT_IDS } from "./invariants";
import { BASELINE_RUNS_N } from "./config";

// ── public types ───────────────────────────────────────────────────────────

export interface FieldObservation {
  name: string;
  sampleValues: unknown[];
  distinctCount: number;
  /** true when every observed value is identical (JSON equality) */
  stable: boolean;
  jsType: "number" | "string" | "array" | "object" | "other";
}

export type ProposeFields = (observations: FieldObservation[]) => Promise<FieldAssertion[]>;

export interface LearnDeps {
  runSut: (sut: SutRef, input: unknown) => Promise<Record<string, unknown>>;
  propose: ProposeFields;
}

// ── helpers ────────────────────────────────────────────────────────────────

function jsTypeOf(value: unknown): FieldObservation["jsType"] {
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  if (value !== null && typeof value === "object") return "object";
  return "other";
}

// ── learner ────────────────────────────────────────────────────────────────

/**
 * Learns a Contract for a SUT by:
 *   1. Running the SUT BASELINE_RUNS_N times per golden input.
 *   2. Building FieldObservations from the union of top-level keys.
 *   3. Delegating field-kind decisions to deps.propose (e.g., an LLM).
 *   4. Deriving invariants from which INVARIANT_IDS have their required keys present.
 */
export async function learnContract(
  sut: SutRef,
  goldenInputs: unknown[],
  deps: LearnDeps,
): Promise<Contract> {
  const { runSut, propose } = deps;

  // Step 1 — collect outputs (inputs.length * BASELINE_RUNS_N runs)
  const allOutputs: Record<string, unknown>[] = [];
  for (const input of goldenInputs) {
    for (let i = 0; i < BASELINE_RUNS_N; i++) {
      allOutputs.push(await runSut(sut, input));
    }
  }

  // Step 2 — build FieldObservation[] from union of all top-level keys
  const keySet = new Set<string>();
  for (const output of allOutputs) {
    for (const key of Object.keys(output)) {
      keySet.add(key);
    }
  }

  const observations: FieldObservation[] = [];
  for (const name of keySet) {
    const sampleValues: unknown[] = allOutputs
      .filter((o) => name in o)
      .map((o) => o[name]);

    const distinctSet = new Set(sampleValues.map((v) => JSON.stringify(v)));
    const distinctCount = distinctSet.size;
    const stable = distinctCount === 1;
    const jsType = sampleValues.length > 0 ? jsTypeOf(sampleValues[0]) : "other";

    observations.push({ name, sampleValues, distinctCount, stable, jsType });
  }

  // Step 3 — delegate field-kind decisions to proposer
  const fields = await propose(observations);

  // Step 4 — derive invariants from observed keys
  const observedKeys = keySet;
  const invariants: string[] = [];

  for (const id of INVARIANT_IDS) {
    let include = false;
    switch (id) {
      case "sum_line_items_eq_total":
        include = observedKeys.has("total") && observedKeys.has("line_items");
        break;
      case "currency_consistent":
        include = observedKeys.has("currency");
        break;
      case "vendor_nonempty":
        include = observedKeys.has("vendor");
        break;
      case "dates_parseable":
        include = observedKeys.has("date");
        break;
      default:
        // Unknown invariant id — skip silently to remain forward-compatible.
        include = false;
    }
    if (include) invariants.push(id);
  }

  return { sutId: sut.id, version: 1, fields, invariants };
}
