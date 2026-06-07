import { describe, it, expect } from "vitest";
import { assertStructural, assertExact, assertSemantic } from "./assertions";

describe("assertion primitives", () => {
  it("structural: passes when field present with right primitive type", () => {
    expect(assertStructural("total", 42, "number").passed).toBe(true);
    expect(assertStructural("total", "x", "number").passed).toBe(false);
  });
  it("exact: strict equality", () => {
    expect(assertExact("total", 42, 42).passed).toBe(true);
    expect(assertExact("total", 42, 43).passed).toBe(false);
  });
  it("semantic: passes when judge score >= threshold", async () => {
    const judge = async () => 0.9;
    const r = await assertSemantic("vendor", "Acme", "ACME Inc", judge, 0.85);
    expect(r.passed).toBe(true); expect(r.score).toBe(0.9);
  });
  it("semantic: fails below threshold", async () => {
    const r = await assertSemantic("vendor", "Acme", "Globex", async () => 0.2, 0.85);
    expect(r.passed).toBe(false);
  });
});
