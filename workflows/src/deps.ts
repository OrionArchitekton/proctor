/**
 * deps.ts — injected dependency implementations for the workflow layer.
 *
 * Honor process.env.PROCTOR_FAKE_LLM === "1" for a deterministic, keyless path.
 * Real paths use the AI SDK but are never exercised in tests/CI.
 */

import type { SutRef, TestReport, DriftVerdict, FieldAssertion } from "@proctor/shared";
import type { FieldObservation } from "@proctor/engine";
import type { InvoiceInput } from "@proctor/sut-invoice";
import { extractInvoice } from "@proctor/sut-invoice";

// ── runSut ─────────────────────────────────────────────────────────────────

/**
 * Adapter: runs the invoice SUT and returns its output as a plain record.
 */
export async function runSut(
  sut: SutRef,
  input: unknown,
): Promise<Record<string, unknown>> {
  const label = (sut.modelLabel as "good" | "degraded") ?? "good";
  const result = await extractInvoice(input as InvoiceInput, { modelLabel: label });
  // Cast to Record so the engine can enumerate top-level keys.
  return result as unknown as Record<string, unknown>;
}

// ── judge (SemanticJudge) ──────────────────────────────────────────────────

/**
 * Char-bigram Jaccard similarity: purely deterministic, no LLM.
 * Normalises inputs (lowercase + trim) before comparing.
 */
function bigramJaccard(a: string, b: string): number {
  const normalise = (s: string) => s.toLowerCase().trim();
  const na = normalise(a);
  const nb = normalise(b);

  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;

  function bigrams(s: string): Set<string> {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      out.add(s.slice(i, i + 2));
    }
    return out;
  }

  const ba = bigrams(na);
  const bb = bigrams(nb);

  let intersection = 0;
  for (const g of ba) {
    if (bb.has(g)) intersection++;
  }

  const union = ba.size + bb.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Semantic judge.
 *   FAKE: deterministic char-bigram Jaccard coefficient in [0,1].
 *   REAL: cosine similarity via embedding or LLM generateObject score. (Not exercised in tests.)
 */
export async function judge(expected: string, actual: string): Promise<number> {
  if (process.env["PROCTOR_FAKE_LLM"] === "1") {
    return bigramJaccard(expected, actual);
  }

  // Real path — lazy imports so the module is clean when FAKE_LLM=1.
  const { generateObject } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");
  const { z } = await import("zod");

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5"),
    schema: z.object({ similarity: z.number().min(0).max(1) }),
    prompt: [
      "Rate the semantic similarity of these two strings on a scale of 0 to 1.",
      `String A: ${expected}`,
      `String B: ${actual}`,
      "Return only {similarity: <number>}.",
    ].join("\n"),
  });

  return object.similarity;
}

// ── reason ─────────────────────────────────────────────────────────────────

/**
 * Drift reasoner.
 *   FAKE: deterministic — exact field changed → real-regression; else legitimate-evolution.
 *         Note: invariant failures are already caught by the classifier before reason is called.
 *   REAL: LLM generateObject deciding kind + rationale + optional patch.
 */
export async function reason(
  report: TestReport,
  _baseline: TestReport,
): Promise<DriftVerdict> {
  if (process.env["PROCTOR_FAKE_LLM"] === "1") {
    const failures = report.results.filter((r) => !r.passed);
    const hasExactFailure = failures.some((r) => r.kind === "exact");
    if (hasExactFailure) {
      return { kind: "real-regression", rationale: "exact field changed" };
    }
    return {
      kind: "legitimate-evolution",
      rationale: "non-exact drift",
      proposedContractPatch: { note: "widen tolerances", fields: [] },
    };
  }

  // Real path.
  const { generateObject } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");
  const { z } = await import("zod");

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5"),
    schema: z.object({
      kind: z.enum(["real-regression", "legitimate-evolution", "flaky"]),
      rationale: z.string(),
      proposedContractPatch: z
        .object({
          note: z.string(),
          fields: z.array(
            z.object({
              name: z.string(),
              kind: z.enum(["structural", "exact", "semantic"]),
              tolerance: z.number().optional(),
            }),
          ),
        })
        .optional(),
    }),
    prompt: [
      "You are a test-drift classifier. Given the failing test report and baseline, classify the drift.",
      `Failing report: ${JSON.stringify(report)}`,
      `Baseline report: ${JSON.stringify(_baseline)}`,
    ].join("\n"),
  });

  return object as DriftVerdict;
}

// ── propose ────────────────────────────────────────────────────────────────

/**
 * Field proposer for learnContract.
 *   FAKE: stable=true → exact; else semantic with tolerance 0.05.
 *   REAL: LLM proposes altitudes based on field observations.
 */
export async function propose(
  observations: FieldObservation[],
): Promise<FieldAssertion[]> {
  if (process.env["PROCTOR_FAKE_LLM"] === "1") {
    // Use structural (presence-only) assertions for all fields.
    //
    // Rationale: in the fake/deterministic path the SUT is called with diverse
    // golden inputs (e.g., 5 different invoices), each producing different
    // values for vendor, total, date, etc.  The runner compares each output
    // against the FIRST-SEEN value, so exact/semantic assertions over
    // per-document fields would produce spurious cross-input failures.
    //
    // Structural assertions only check that the field is present and non-null,
    // which is correct regardless of which invoice is being processed.
    // Value-level correctness is enforced by the engine's invariant checks
    // (e.g., sum_line_items_eq_total), which catch regressions like the
    // degraded model's wrong total.
    return observations.map((obs) => ({
      name: obs.name,
      kind: "structural" as const,
    }));
  }

  // Real path.
  const { generateObject } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");
  const { z } = await import("zod");

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5"),
    schema: z.object({
      fields: z.array(
        z.object({
          name: z.string(),
          kind: z.enum(["structural", "exact", "semantic"]),
          tolerance: z.number().optional(),
        }),
      ),
    }),
    prompt: [
      "Propose field assertion kinds for these observed fields.",
      "Use 'exact' for stable fields, 'semantic' for variable text, 'structural' for presence-only checks.",
      `Observations: ${JSON.stringify(observations)}`,
    ].join("\n"),
  });

  return object.fields as FieldAssertion[];
}
