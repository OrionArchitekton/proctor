import { describe, it, expect } from "vitest";
import { ContractSchema } from "./schemas";

describe("ContractSchema", () => {
  it("accepts a minimal valid contract", () => {
    const c = { sutId: "invoice", version: 1, fields: [
      { name: "total", kind: "exact" as const },
      { name: "vendor", kind: "semantic" as const, tolerance: 0.05 },
    ], invariants: ["sum(line_items)==total"] };
    expect(ContractSchema.parse(c).fields.length).toBe(2);
  });
  it("rejects an unknown assertion kind", () => {
    expect(() => ContractSchema.parse({ sutId: "x", version: 1, fields: [{ name: "a", kind: "bogus" }], invariants: [] })).toThrow();
  });
});
