import type { AssertionResult } from "@proctor/shared";

type Rec = Record<string, unknown>;

function asRec(v: unknown): Rec | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Rec)
    : undefined;
}

// ── individual checkers ────────────────────────────────────────────────────

function checkSumLineItemsEqTotal(output: unknown): AssertionResult {
  const obj = asRec(output);
  if (!obj) {
    return { field: "sum_line_items_eq_total", kind: "exact", passed: false, evidence: "output is not an object" };
  }
  const total = obj["total"];
  const lineItems = obj["line_items"];
  if (typeof total !== "number") {
    return { field: "sum_line_items_eq_total", kind: "exact", passed: false, evidence: `total is not a number (got ${typeof total})` };
  }
  if (!Array.isArray(lineItems)) {
    return { field: "sum_line_items_eq_total", kind: "exact", passed: false, evidence: "line_items is not an array" };
  }
  let sum = 0;
  for (const item of lineItems) {
    const rec = asRec(item);
    if (!rec || typeof rec["amount"] !== "number") {
      return { field: "sum_line_items_eq_total", kind: "exact", passed: false, evidence: "line_items contains item without numeric amount" };
    }
    sum += rec["amount"] as number;
  }
  const passed = Math.abs(sum - total) < 1e-6;
  return {
    field: "sum_line_items_eq_total",
    kind: "exact",
    passed,
    evidence: `sum(line_items.amount)=${sum} total=${total}`,
  };
}

function checkCurrencyConsistent(output: unknown): AssertionResult {
  const obj = asRec(output);
  if (!obj) {
    return { field: "currency_consistent", kind: "exact", passed: false, evidence: "output is not an object" };
  }
  const currency = obj["currency"];
  if (typeof currency !== "string" || currency.trim().length === 0) {
    return { field: "currency_consistent", kind: "exact", passed: false, evidence: `currency is missing or empty (got ${JSON.stringify(currency)})` };
  }
  // If line_items carry their own currency field, all must match the top-level
  const lineItems = obj["line_items"];
  if (Array.isArray(lineItems)) {
    for (const item of lineItems) {
      const rec = asRec(item);
      if (rec && "currency" in rec) {
        if (rec["currency"] !== currency) {
          return {
            field: "currency_consistent",
            kind: "exact",
            passed: false,
            evidence: `line item currency "${rec["currency"]}" does not match top-level "${currency}"`,
          };
        }
      }
    }
  }
  return { field: "currency_consistent", kind: "exact", passed: true, evidence: `currency="${currency}" consistent` };
}

function checkVendorNonempty(output: unknown): AssertionResult {
  const obj = asRec(output);
  if (!obj) {
    return { field: "vendor_nonempty", kind: "exact", passed: false, evidence: "output is not an object" };
  }
  const vendor = obj["vendor"];
  const passed = typeof vendor === "string" && vendor.trim().length > 0;
  return {
    field: "vendor_nonempty",
    kind: "exact",
    passed,
    evidence: passed ? `vendor="${vendor}"` : `vendor is missing or blank (got ${JSON.stringify(vendor)})`,
  };
}

function checkDatesParseable(output: unknown): AssertionResult {
  const obj = asRec(output);
  if (!obj) {
    return { field: "dates_parseable", kind: "exact", passed: false, evidence: "output is not an object" };
  }
  const date = obj["date"];
  if (typeof date !== "string") {
    return { field: "dates_parseable", kind: "exact", passed: false, evidence: `date is not a string (got ${typeof date})` };
  }
  const parsed = Date.parse(date);
  const passed = !isNaN(parsed);
  return {
    field: "dates_parseable",
    kind: "exact",
    passed,
    evidence: passed ? `date="${date}" parses OK` : `date="${date}" is not parseable`,
  };
}

// ── registry ───────────────────────────────────────────────────────────────

const REGISTRY: Record<string, (output: unknown) => AssertionResult> = {
  sum_line_items_eq_total: checkSumLineItemsEqTotal,
  currency_consistent: checkCurrencyConsistent,
  vendor_nonempty: checkVendorNonempty,
  dates_parseable: checkDatesParseable,
};

// ── public API ─────────────────────────────────────────────────────────────

export function checkInvariants(output: unknown, ids: string[]): AssertionResult[] {
  return ids.map((id) => {
    const checker = REGISTRY[id];
    if (!checker) {
      return {
        field: id,
        kind: "exact" as const,
        passed: false,
        evidence: `unknown invariant id: "${id}"`,
      };
    }
    return checker(output);
  });
}
