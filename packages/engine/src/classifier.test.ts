import { describe, it, expect } from "vitest";
import type { TestReport } from "@proctor/shared";
import { classifyDrift, type ReasonDrift } from "./classifier";

// ── helpers ────────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<TestReport> = {}): TestReport {
  return {
    sutId: "sut-test",
    allPassed: false,
    results: [],
    rawOutputs: [],
    ...overrides,
  };
}

const EMPTY_BASELINE = makeReport({ allPassed: true, results: [] });

// ── (a) invariant failure → real-regression, reason NOT called ─────────────

describe("classifyDrift — invariant failure", () => {
  it("returns real-regression without calling reason when an invariant id fails", async () => {
    let reasonCalled = false;
    const reason: ReasonDrift = async () => {
      reasonCalled = true;
      return { kind: "real-regression", rationale: "should not reach here" };
    };

    const report = makeReport({
      results: [
        {
          field: "sum_line_items_eq_total",
          kind: "exact",
          passed: false,
          evidence: "sum=25 total=30",
        },
      ],
    });

    const verdict = await classifyDrift(report, EMPTY_BASELINE, { reason });

    expect(verdict.kind).toBe("real-regression");
    expect(verdict.rationale).toContain("sum_line_items_eq_total");
    expect(reasonCalled).toBe(false);
  });

  it("captures all failing invariant ids in the rationale", async () => {
    const reason: ReasonDrift = async () => {
      throw new Error("should not be called");
    };

    const report = makeReport({
      results: [
        {
          field: "sum_line_items_eq_total",
          kind: "exact",
          passed: false,
          evidence: "x",
        },
        {
          field: "currency_consistent",
          kind: "exact",
          passed: false,
          evidence: "y",
        },
      ],
    });

    const verdict = await classifyDrift(report, EMPTY_BASELINE, { reason });

    expect(verdict.kind).toBe("real-regression");
    expect(verdict.rationale).toContain("sum_line_items_eq_total");
    expect(verdict.rationale).toContain("currency_consistent");
  });
});

// ── (b) borderline semantic → flaky, reason NOT called ────────────────────

describe("classifyDrift — borderline semantic (flaky)", () => {
  it("returns flaky when all failures are semantic and scores within tolerance", async () => {
    let reasonCalled = false;
    const reason: ReasonDrift = async () => {
      reasonCalled = true;
      return { kind: "legitimate-evolution", rationale: "should not reach here" };
    };

    // score 0.82 >= (0.85 - 0.05 = 0.80): within flaky tolerance
    const report = makeReport({
      results: [
        {
          field: "vendor",
          kind: "semantic",
          passed: false,
          score: 0.82,
          evidence: "similarity=0.82 threshold=0.85",
        },
      ],
    });

    const verdict = await classifyDrift(report, EMPTY_BASELINE, { reason });

    expect(verdict.kind).toBe("flaky");
    expect(reasonCalled).toBe(false);
  });

  it("does NOT short-circuit to flaky when a semantic score is below tolerance floor", async () => {
    // score 0.75 < 0.80 (below floor): should delegate to reason
    let reasonCalled = false;
    const reason: ReasonDrift = async () => {
      reasonCalled = true;
      return { kind: "legitimate-evolution", rationale: "deliberate change" };
    };

    const report = makeReport({
      results: [
        {
          field: "vendor",
          kind: "semantic",
          passed: false,
          score: 0.75,
          evidence: "similarity=0.75 threshold=0.85",
        },
      ],
    });

    const verdict = await classifyDrift(report, EMPTY_BASELINE, { reason });

    expect(verdict.kind).toBe("legitimate-evolution");
    expect(reasonCalled).toBe(true);
  });

  it("does NOT short-circuit to flaky when any failure lacks a numeric score", async () => {
    let reasonCalled = false;
    const reason: ReasonDrift = async () => {
      reasonCalled = true;
      return { kind: "real-regression", rationale: "missing score is suspicious" };
    };

    const report = makeReport({
      results: [
        {
          field: "vendor",
          kind: "semantic",
          passed: false,
          // score intentionally omitted
          evidence: "no score available",
        },
      ],
    });

    const verdict = await classifyDrift(report, EMPTY_BASELINE, { reason });

    expect(verdict.kind).toBe("real-regression");
    expect(reasonCalled).toBe(true);
  });
});

// ── (c) exact field change (non-invariant) → delegates to reason ───────────

describe("classifyDrift — exact field failure (non-invariant)", () => {
  it("delegates to reason and returns its verdict with proposedContractPatch", async () => {
    let reasonCalled = false;
    const reason: ReasonDrift = async () => {
      reasonCalled = true;
      return {
        kind: "legitimate-evolution",
        rationale: "ok",
        proposedContractPatch: { note: "widen", fields: [] },
      };
    };

    const report = makeReport({
      results: [
        {
          field: "total",
          kind: "exact",
          passed: false,
          evidence: "actual=99 expected=30",
        },
      ],
    });

    const verdict = await classifyDrift(report, EMPTY_BASELINE, { reason });

    expect(verdict.kind).toBe("legitimate-evolution");
    expect(verdict.proposedContractPatch).toBeDefined();
    expect(verdict.proposedContractPatch?.note).toBe("widen");
    expect(reasonCalled).toBe(true);
  });
});

// ── (defensive) zero failures → flaky ─────────────────────────────────────

describe("classifyDrift — defensive zero failures", () => {
  it("returns flaky with 'no assertion failures' when report has no failures", async () => {
    const reason: ReasonDrift = async () => {
      throw new Error("should not be called");
    };

    const report = makeReport({
      allPassed: true,
      results: [
        { field: "total", kind: "exact", passed: true, evidence: "match" },
      ],
    });

    const verdict = await classifyDrift(report, EMPTY_BASELINE, { reason });

    expect(verdict.kind).toBe("flaky");
    expect(verdict.rationale).toContain("no assertion failures");
  });
});
