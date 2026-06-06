// PROCTOR_FAKE_LLM must be set before any import to ensure the module sees it
process.env["PROCTOR_FAKE_LLM"] = "1";

import { describe, it, expect } from "vitest";
import { extractInvoice, InvoiceOutputSchema } from "./agent.js";
import { loadFixtures } from "./fixtures.js";

const fixtures = loadFixtures();
const inv001 = fixtures.find((f) => f.id === "inv-001");
if (!inv001) throw new Error("inv-001 fixture not found");

const sum = (items: Array<{ amount: number }>) =>
  items.reduce((acc, item) => acc + item.amount, 0);

describe("extractInvoice (fake LLM)", () => {
  it('good: total equals sum of line_items', async () => {
    const result = await extractInvoice(inv001, { modelLabel: "good" });
    const parsed = InvoiceOutputSchema.parse(result);
    const expected = sum(parsed.line_items);
    expect(parsed.total).toBe(expected);
  });

  it('degraded: total does NOT equal sum of line_items', async () => {
    const result = await extractInvoice(inv001, { modelLabel: "degraded" });
    const parsed = InvoiceOutputSchema.parse(result);
    const expected = sum(parsed.line_items);
    expect(parsed.total).not.toBe(expected);
  });

  it('good: result parses against InvoiceOutputSchema', async () => {
    const result = await extractInvoice(inv001, { modelLabel: "good" });
    expect(() => InvoiceOutputSchema.parse(result)).not.toThrow();
  });

  it('degraded: result parses against InvoiceOutputSchema', async () => {
    const result = await extractInvoice(inv001, { modelLabel: "degraded" });
    expect(() => InvoiceOutputSchema.parse(result)).not.toThrow();
  });

  it('good: vendor, currency, date match fixture', async () => {
    const result = await extractInvoice(inv001, { modelLabel: "good" });
    expect(result.vendor).toBe(inv001.vendor);
    expect(result.currency).toBe(inv001.currency);
    expect(result.date).toBe(inv001.date);
  });

  it('degraded: vendor, currency, date still match fixture', async () => {
    const result = await extractInvoice(inv001, { modelLabel: "degraded" });
    expect(result.vendor).toBe(inv001.vendor);
    expect(result.currency).toBe(inv001.currency);
    expect(result.date).toBe(inv001.date);
  });
});
