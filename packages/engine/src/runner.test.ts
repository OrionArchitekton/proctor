import { describe, it, expect, vi } from "vitest";
import { runContract } from "./runner";
import type { Contract, SutRef } from "@proctor/shared";
import type { SemanticJudge } from "./assertions";

const FIXED_OUTPUT = {
  total: 30,
  vendor: "Acme",
  currency: "USD",
  date: "2026-01-01",
  line_items: [{ amount: 10 }, { amount: 20 }],
};

const sut: SutRef = { id: "invoice-extractor", modelLabel: "gpt-4o" };

describe("runContract", () => {
  it("passes all assertions with a well-behaved SUT", async () => {
    const runSut = vi.fn().mockResolvedValue(FIXED_OUTPUT);
    const judge: SemanticJudge = async () => 0.95;

    const contract: Contract = {
      sutId: "invoice-extractor",
      version: 1,
      fields: [
        { name: "total", kind: "exact" },
        { name: "vendor", kind: "semantic" },
      ],
      invariants: ["sum_line_items_eq_total"],
    };

    const goldenInputs = ["invoice_a.pdf", "invoice_b.pdf"];
    const report = await runContract(sut, contract, goldenInputs, { runSut, judge });

    expect(report.sutId).toBe("invoice-extractor");
    expect(report.allPassed).toBe(true);
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.rawOutputs).toHaveLength(2);
    // runSut called once per golden input
    expect(runSut).toHaveBeenCalledTimes(2);
  });

  it("fails when a structural field is absent from the output", async () => {
    // Output does NOT include "missing_field"
    const runSut = vi.fn().mockResolvedValue(FIXED_OUTPUT);
    const judge: SemanticJudge = async () => 0.95;

    const contract: Contract = {
      sutId: "invoice-extractor",
      version: 1,
      fields: [{ name: "missing_field", kind: "structural" }],
      invariants: [],
    };

    const goldenInputs = ["invoice_a.pdf"];
    const report = await runContract(sut, contract, goldenInputs, { runSut, judge });

    expect(report.allPassed).toBe(false);
    const structuralResult = report.results.find(
      (r) => r.field === "missing_field" && r.kind === "structural",
    );
    expect(structuralResult).toBeDefined();
    expect(structuralResult?.passed).toBe(false);
  });
});
