import { describe, it, expect } from "vitest";
import type { SutRef } from "@proctor/shared";
import { learnContract, type FieldObservation, type ProposeFields, type LearnDeps } from "./learner";
import { BASELINE_RUNS_N } from "./config";

// ── helpers ────────────────────────────────────────────────────────────────

const SUT: SutRef = { id: "invoice-sut", modelLabel: "gpt-4o" };

const GOLDEN_INPUTS: unknown[] = [
  { invoiceId: "inv-001" },
  { invoiceId: "inv-002" },
];

// Vendor casing cycles deterministically by run index (no Math.random).
const VENDOR_CYCLE = ["Acme", "ACME", "acme"];

function makeRunSut(callCount: { n: number }) {
  return async (_sut: SutRef, _input: unknown): Promise<Record<string, unknown>> => {
    const idx = callCount.n++;
    return {
      total: 30,
      line_items: [{ amount: 10 }, { amount: 20 }],
      currency: "USD",
      date: "2026-01-01",
      vendor: VENDOR_CYCLE[idx % VENDOR_CYCLE.length],
    };
  };
}

// Propose returns exact for stable fields, semantic for unstable ones.
const propose: ProposeFields = async (observations: FieldObservation[]) => {
  return observations
    .filter((o) => ["total", "vendor"].includes(o.name))
    .map((o) => ({
      name: o.name,
      kind: o.stable ? ("exact" as const) : ("semantic" as const),
      ...(o.stable ? {} : { tolerance: 0.05 }),
    }));
};

// ── main correctness test ──────────────────────────────────────────────────

describe("learnContract", () => {
  it("returns contract with correct fields, invariants, version, and sutId", async () => {
    const callCount = { n: 0 };
    const deps: LearnDeps = {
      runSut: makeRunSut(callCount),
      propose,
    };

    const contract = await learnContract(SUT, GOLDEN_INPUTS, deps);

    // sutId and version
    expect(contract.sutId).toBe("invoice-sut");
    expect(contract.version).toBe(1);

    // fields: total (stable → exact), vendor (unstable → semantic)
    const totalField = contract.fields.find((f) => f.name === "total");
    const vendorField = contract.fields.find((f) => f.name === "vendor");

    expect(totalField).toBeDefined();
    expect(totalField?.kind).toBe("exact");

    expect(vendorField).toBeDefined();
    expect(vendorField?.kind).toBe("semantic");

    // invariants: all four should be present (total+line_items, currency, vendor, date)
    expect(contract.invariants).toContain("sum_line_items_eq_total");
    expect(contract.invariants).toContain("currency_consistent");
    expect(contract.invariants).toContain("vendor_nonempty");
    expect(contract.invariants).toContain("dates_parseable");
  });

  it("calls runSut exactly goldenInputs.length * BASELINE_RUNS_N times", async () => {
    const callCount = { n: 0 };
    const deps: LearnDeps = {
      runSut: makeRunSut(callCount),
      propose,
    };

    await learnContract(SUT, GOLDEN_INPUTS, deps);

    expect(callCount.n).toBe(GOLDEN_INPUTS.length * BASELINE_RUNS_N);
  });

  it("vendor observation is marked unstable (cycles across runs)", async () => {
    const callCount = { n: 0 };
    let capturedObservations: FieldObservation[] | null = null;

    const capturePropose: ProposeFields = async (observations) => {
      capturedObservations = observations;
      return [];
    };

    await learnContract(SUT, GOLDEN_INPUTS, {
      runSut: makeRunSut(callCount),
      propose: capturePropose,
    });

    expect(capturedObservations).not.toBeNull();
    const vendorObs = capturedObservations!.find((o) => o.name === "vendor");
    expect(vendorObs).toBeDefined();
    expect(vendorObs!.stable).toBe(false);
    expect(vendorObs!.distinctCount).toBeGreaterThan(1);
  });

  it("total observation is marked stable across all runs", async () => {
    const callCount = { n: 0 };
    let capturedObservations: FieldObservation[] | null = null;

    const capturePropose: ProposeFields = async (observations) => {
      capturedObservations = observations;
      return [];
    };

    await learnContract(SUT, GOLDEN_INPUTS, {
      runSut: makeRunSut(callCount),
      propose: capturePropose,
    });

    const totalObs = capturedObservations!.find((o) => o.name === "total");
    expect(totalObs).toBeDefined();
    expect(totalObs!.stable).toBe(true);
    expect(totalObs!.distinctCount).toBe(1);
    expect(totalObs!.jsType).toBe("number");
  });

  it("observations contain all top-level keys seen across outputs", async () => {
    const callCount = { n: 0 };
    let capturedObservations: FieldObservation[] | null = null;

    const capturePropose: ProposeFields = async (observations) => {
      capturedObservations = observations;
      return [];
    };

    await learnContract(SUT, GOLDEN_INPUTS, {
      runSut: makeRunSut(callCount),
      propose: capturePropose,
    });

    const names = capturedObservations!.map((o) => o.name);
    expect(names).toContain("total");
    expect(names).toContain("line_items");
    expect(names).toContain("currency");
    expect(names).toContain("date");
    expect(names).toContain("vendor");
  });

  it("jsType is classified correctly", async () => {
    const callCount = { n: 0 };
    let capturedObservations: FieldObservation[] | null = null;

    const capturePropose: ProposeFields = async (observations) => {
      capturedObservations = observations;
      return [];
    };

    await learnContract(SUT, GOLDEN_INPUTS, {
      runSut: makeRunSut(callCount),
      propose: capturePropose,
    });

    const lineItemsObs = capturedObservations!.find((o) => o.name === "line_items");
    expect(lineItemsObs?.jsType).toBe("array");

    const currencyObs = capturedObservations!.find((o) => o.name === "currency");
    expect(currencyObs?.jsType).toBe("string");
  });

  it("only includes invariants whose required keys are present in output", async () => {
    // runSut returns output WITHOUT currency or date — only total + line_items + vendor
    const sparseRunSut = async (): Promise<Record<string, unknown>> => ({
      total: 30,
      line_items: [{ amount: 30 }],
      vendor: "Acme",
    });

    const contract = await learnContract(SUT, [{ invoiceId: "x" }], {
      runSut: sparseRunSut,
      propose: async () => [],
    });

    expect(contract.invariants).toContain("sum_line_items_eq_total");
    expect(contract.invariants).toContain("vendor_nonempty");
    expect(contract.invariants).not.toContain("currency_consistent");
    expect(contract.invariants).not.toContain("dates_parseable");
  });

  it("passes contract fields directly from propose output without modification", async () => {
    const callCount = { n: 0 };
    const specificPropose: ProposeFields = async () => [
      { name: "total", kind: "exact" },
      { name: "currency", kind: "structural" },
    ];

    const contract = await learnContract(SUT, GOLDEN_INPUTS, {
      runSut: makeRunSut(callCount),
      propose: specificPropose,
    });

    expect(contract.fields).toHaveLength(2);
    expect(contract.fields[0]).toEqual({ name: "total", kind: "exact" });
    expect(contract.fields[1]).toEqual({ name: "currency", kind: "structural" });
  });
});
