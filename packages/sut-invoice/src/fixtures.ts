import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface InvoiceLineItem {
  description?: string;
  amount: number;
}

export interface InvoiceInput {
  id: string;
  text: string;
  vendor: string;
  currency: string;
  date: string;
  line_items: InvoiceLineItem[];
}

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

export function loadFixtures(): InvoiceInput[] {
  const files = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  return files.map((file) => {
    const raw = readFileSync(join(FIXTURES_DIR, file), "utf-8");
    return JSON.parse(raw) as InvoiceInput;
  });
}
