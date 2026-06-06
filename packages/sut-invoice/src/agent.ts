import { z } from "zod";
import type { InvoiceInput } from "./fixtures.js";

// ── Schema ──────────────────────────────────────────────────────────────────

export const InvoiceOutputSchema = z.object({
  vendor: z.string(),
  total: z.number(),
  currency: z.string(),
  date: z.string(),
  line_items: z.array(
    z.object({
      description: z.string().optional(),
      amount: z.number(),
    })
  ),
});

export type InvoiceOutput = z.infer<typeof InvoiceOutputSchema>;

// ── Opts & types ─────────────────────────────────────────────────────────────

export type ModelLabel = "good" | "degraded";

export interface ExtractOpts {
  modelLabel: ModelLabel;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sumLineItems(items: Array<{ amount: number }>): number {
  return items.reduce((acc, item) => acc + item.amount, 0);
}

// ── Fake path ────────────────────────────────────────────────────────────────

function fakePath(input: InvoiceInput, opts: ExtractOpts): InvoiceOutput {
  const { vendor, currency, date, line_items } = input;
  const correctTotal = sumLineItems(line_items);

  if (opts.modelLabel === "good") {
    return { vendor, currency, date, line_items, total: correctTotal };
  }

  // degraded: deterministic wrong total — mimics "forgot to sum" regression
  const wrongTotal =
    line_items.length === 1
      ? line_items[0]!.amount * 0.9  // single-item edge: still shows regression
      : line_items[0]!.amount;        // multi-item: only first item (omits rest)

  return { vendor, currency, date, line_items, total: wrongTotal };
}

// ── Real path (requires API key — not exercised in tests/CI) ─────────────────

async function realPath(input: InvoiceInput, opts: ExtractOpts): Promise<InvoiceOutput> {
  // Lazy-import so the module does NOT load when PROCTOR_FAKE_LLM=1.
  const { generateObject } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");

  const isGood = opts.modelLabel === "good";

  const model = isGood
    ? anthropic("claude-sonnet-4-5")
    : anthropic("claude-haiku-4-5");

  const systemPrompt = isGood
    ? [
        "You are an invoice-extraction assistant.",
        "Extract all fields accurately from the invoice text.",
        "Compute `total` as the exact sum of all line item amounts.",
      ].join(" ")
    : [
        "You are an invoice-extraction assistant.",
        "Extract all fields accurately from the invoice text.",
        // Intentionally omits total-summing instruction — introduces drift
      ].join(" ");

  const { object } = await generateObject({
    model,
    schema: InvoiceOutputSchema,
    system: systemPrompt,
    prompt: input.text,
  });

  return object;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function extractInvoice(
  input: InvoiceInput,
  opts: ExtractOpts
): Promise<InvoiceOutput> {
  if (process.env["PROCTOR_FAKE_LLM"] === "1") {
    return fakePath(input, opts);
  }
  return realPath(input, opts);
}
