import { describe, it, expect } from "vitest";
import { checkInvariants } from "./invariants";

describe("invariants", () => {
  it("sum_line_items_eq_total passes", () => {
    const out = { total: 30, line_items: [{ amount: 10 }, { amount: 20 }], currency: "USD", vendor: "Acme", date: "2026-01-01" };
    const r = checkInvariants(out, ["sum_line_items_eq_total", "vendor_nonempty"]);
    expect(r.every(x => x.passed)).toBe(true);
  });
  it("flags mismatched total", () => {
    const out = { total: 99, line_items: [{ amount: 10 }], currency: "USD", vendor: "Acme", date: "2026-01-01" };
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(checkInvariants(out, ["sum_line_items_eq_total"])[0]!.passed).toBe(false);
  });
});
