import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Contract, ContractPatch, FieldAssertion } from "@proctor/shared";

// ── ContractStore ──────────────────────────────────────────────────────────

/**
 * File-backed store for Contract documents.
 *
 * Each contract is stored as pretty-printed JSON at:
 *   <baseDir>/<sutId>.json
 *
 * This is the ONE engine module permitted to do file I/O.
 * No Date.now() or Math.random() anywhere.
 */
export class ContractStore {
  constructor(private readonly baseDir: string) {}

  private filePath(sutId: string): string {
    return join(this.baseDir, `${sutId}.json`);
  }

  /**
   * Reads and parses the contract file for sutId.
   * Returns null if the file does not exist (ENOENT).
   * Re-throws any other error.
   */
  async load(sutId: string): Promise<Contract | null> {
    try {
      const raw = await readFile(this.filePath(sutId), "utf-8");
      return JSON.parse(raw) as Contract;
    } catch (err) {
      if (isEnoent(err)) return null;
      throw err;
    }
  }

  /**
   * Writes contract as pretty JSON to <baseDir>/<sutId>.json.
   * Creates baseDir (and parents) recursively if needed.
   */
  async save(contract: Contract): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(this.filePath(contract.sutId), JSON.stringify(contract, null, 2), "utf-8");
  }

  /**
   * Loads the existing contract, applies patch, bumps version, persists, returns updated contract.
   *
   * Merge rules:
   *   - fields: merge by field name — patch fields replace existing fields with the same name;
   *             new names are appended; untouched fields are preserved.
   *   - invariants: union — existing first, then new ones not already present.
   *   - patch.note: metadata for the caller; NOT stored on the contract.
   *
   * Throws a clear Error if no contract exists for sutId.
   */
  async version(sutId: string, patch: ContractPatch): Promise<Contract> {
    const existing = await this.load(sutId);
    if (existing === null) {
      throw new Error(`ContractStore.version: no contract found for sutId "${sutId}"`);
    }

    // Merge fields
    let mergedFields: FieldAssertion[];
    if (patch.fields !== undefined) {
      const patchMap = new Map<string, FieldAssertion>(patch.fields.map((f) => [f.name, f]));
      // Replace existing fields where name matches, preserve others, then append truly new ones.
      const updated = existing.fields.map((f) => patchMap.get(f.name) ?? f);
      const existingNames = new Set(existing.fields.map((f) => f.name));
      // Iterate patchMap (de-duplicated by name) so duplicate new-field names in
      // patch.fields collapse to a single appended entry.
      const appended = [...patchMap.values()].filter((f) => !existingNames.has(f.name));
      mergedFields = [...updated, ...appended];
    } else {
      mergedFields = existing.fields;
    }

    // Union invariants (existing order first, then new-only entries)
    let mergedInvariants: string[];
    if (patch.invariants !== undefined) {
      const existingSet = new Set(existing.invariants);
      const newOnly = patch.invariants.filter((inv) => !existingSet.has(inv));
      mergedInvariants = [...existing.invariants, ...newOnly];
    } else {
      mergedInvariants = existing.invariants;
    }

    const updated: Contract = {
      sutId: existing.sutId,
      version: existing.version + 1,
      fields: mergedFields,
      invariants: mergedInvariants,
    };

    await this.save(updated);
    return updated;
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "ENOENT"
  );
}
