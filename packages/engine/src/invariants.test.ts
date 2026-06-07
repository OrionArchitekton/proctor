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

  // ── currency_consistent ──────────────────────────────────────────────────
  describe("currency_consistent", () => {
    it("passes when top-level currency is present and line items match", () => {
      const out = {
        total: 30,
        currency: "USD",
        line_items: [{ amount: 10, currency: "USD" }, { amount: 20, currency: "USD" }],
        vendor: "Acme",
        date: "2026-01-01",
      };
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(checkInvariants(out, ["currency_consistent"])[0]!.passed).toBe(true);
    });

    it("fails when top-level currency is empty", () => {
      const out = { total: 30, currency: "", vendor: "Acme", date: "2026-01-01", line_items: [] };
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = checkInvariants(out, ["currency_consistent"])[0]!;
      expect(result.passed).toBe(false);
    });

    it("fails when a line item currency mismatches the top-level", () => {
      const out = {
        total: 30,
        currency: "USD",
        line_items: [{ amount: 30, currency: "EUR" }],
        vendor: "Acme",
        date: "2026-01-01",
      };
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = checkInvariants(out, ["currency_consistent"])[0]!;
      expect(result.passed).toBe(false);
      expect(result.evidence).toMatch(/EUR/);
    });
  });

  // ── dates_parseable ──────────────────────────────────────────────────────
  describe("dates_parseable", () => {
    it("passes with a valid ISO date string", () => {
      const out = { total: 30, currency: "USD", vendor: "Acme", date: "2026-06-06", line_items: [] };
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(checkInvariants(out, ["dates_parseable"])[0]!.passed).toBe(true);
    });

    it("fails with an unparseable date string", () => {
      const out = { total: 30, currency: "USD", vendor: "Acme", date: "not-a-date", line_items: [] };
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = checkInvariants(out, ["dates_parseable"])[0]!;
      expect(result.passed).toBe(false);
      expect(result.evidence).toMatch(/not parseable/);
    });
  });

  // ── unknown invariant id ─────────────────────────────────────────────────
  describe("unknown invariant id", () => {
    it("returns a single failed result without throwing", () => {
      const out = { total: 30, currency: "USD", vendor: "Acme", date: "2026-01-01", line_items: [] };
      const results = checkInvariants(out, ["does_not_exist"]);
      expect(results).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(results[0]!.passed).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(results[0]!.evidence).toMatch(/unknown invariant/i);
    });
  });
});
