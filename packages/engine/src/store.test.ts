import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Contract } from "@proctor/shared";
import { ContractStore } from "./store";

// ── fixtures ───────────────────────────────────────────────────────────────

const BASE_CONTRACT: Contract = {
  sutId: "invoice",
  version: 1,
  fields: [{ name: "total", kind: "exact" }],
  invariants: ["vendor_nonempty"],
};

// ── test lifecycle ─────────────────────────────────────────────────────────

let tmpDir: string;
let store: ContractStore;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "proctor-store-test-"));
  store = new ContractStore(tmpDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── round-trip ─────────────────────────────────────────────────────────────

describe("ContractStore — round-trip", () => {
  it("save then load returns an equal object", async () => {
    await store.save(BASE_CONTRACT);
    const loaded = await store.load("invoice");
    expect(loaded).toEqual(BASE_CONTRACT);
  });

  it("load of a missing sutId returns null", async () => {
    const result = await store.load("nonexistent-sut");
    expect(result).toBeNull();
  });

  it("save creates baseDir if it does not exist yet (nested subdir)", async () => {
    // Use a subdir of tmpDir that doesn't exist yet.
    const nested = join(tmpDir, "deep", "nested");
    const nestedStore = new ContractStore(nested);
    await nestedStore.save(BASE_CONTRACT);
    const loaded = await nestedStore.load("invoice");
    expect(loaded).toEqual(BASE_CONTRACT);
  });

  it("overwrites on second save", async () => {
    await store.save(BASE_CONTRACT);
    const v2: Contract = { ...BASE_CONTRACT, version: 2 };
    await store.save(v2);
    const loaded = await store.load("invoice");
    expect(loaded?.version).toBe(2);
  });
});

// ── version ────────────────────────────────────────────────────────────────

describe("ContractStore — version", () => {
  it("bumps version number", async () => {
    await store.save(BASE_CONTRACT);
    const patched = await store.version("invoice", {
      fields: [{ name: "vendor", kind: "semantic", tolerance: 0.05 }],
      invariants: ["dates_parseable"],
      note: "evolve",
    });
    expect(patched.version).toBe(2);
  });

  it("returned contract has both old and new fields (merge by name)", async () => {
    await store.save(BASE_CONTRACT); // fields: [total(exact)]
    const patched = await store.version("invoice", {
      fields: [{ name: "vendor", kind: "semantic", tolerance: 0.05 }],
      invariants: ["dates_parseable"],
      note: "evolve",
    });
    const totalField = patched.fields.find((f) => f.name === "total");
    const vendorField = patched.fields.find((f) => f.name === "vendor");
    expect(totalField).toBeDefined();
    expect(totalField?.kind).toBe("exact");
    expect(vendorField).toBeDefined();
    expect(vendorField?.kind).toBe("semantic");
    expect(vendorField?.tolerance).toBe(0.05);
  });

  it("union invariants: existing first then new, no duplicates", async () => {
    await store.save(BASE_CONTRACT); // invariants: ["vendor_nonempty"]
    const patched = await store.version("invoice", {
      fields: [{ name: "vendor", kind: "semantic", tolerance: 0.05 }],
      invariants: ["dates_parseable"],
      note: "evolve",
    });
    expect(patched.invariants).toEqual(["vendor_nonempty", "dates_parseable"]);
  });

  it("persists the new version so a fresh load reflects v2", async () => {
    await store.save(BASE_CONTRACT);
    await store.version("invoice", {
      fields: [{ name: "vendor", kind: "semantic", tolerance: 0.05 }],
      invariants: ["dates_parseable"],
      note: "evolve",
    });
    const reloaded = await store.load("invoice");
    expect(reloaded?.version).toBe(2);
    expect(reloaded?.fields.find((f) => f.name === "vendor")).toBeDefined();
    expect(reloaded?.invariants).toContain("dates_parseable");
  });

  it("patch.note is NOT stored on the persisted contract", async () => {
    await store.save(BASE_CONTRACT);
    const patched = await store.version("invoice", {
      note: "just a note, no field/invariant changes",
    });
    // The returned contract and the persisted one should not have a 'note' property.
    expect((patched as unknown as { note?: string }).note).toBeUndefined();
    const loaded = await store.load("invoice");
    expect((loaded as unknown as { note?: string })?.note).toBeUndefined();
  });

  it("merge by name: patching an existing field name replaces it (not duplicates)", async () => {
    // Start with total as 'exact', then patch total to 'semantic'
    await store.save(BASE_CONTRACT); // fields: [{name:"total", kind:"exact"}]
    const patched = await store.version("invoice", {
      fields: [{ name: "total", kind: "semantic", tolerance: 0.1 }],
      note: "change total kind",
    });
    const totalFields = patched.fields.filter((f) => f.name === "total");
    expect(totalFields).toHaveLength(1); // no duplicate
    expect(totalFields[0].kind).toBe("semantic");
    expect(totalFields[0].tolerance).toBe(0.1);
  });

  it("invariant deduplication: patching an existing invariant does not duplicate it", async () => {
    await store.save(BASE_CONTRACT); // invariants: ["vendor_nonempty"]
    const patched = await store.version("invoice", {
      invariants: ["vendor_nonempty", "dates_parseable"], // vendor_nonempty already exists
      note: "add dates",
    });
    expect(patched.invariants.filter((i) => i === "vendor_nonempty")).toHaveLength(1);
    expect(patched.invariants).toContain("dates_parseable");
  });

  it("version with no fields/invariants patch preserves existing values", async () => {
    await store.save(BASE_CONTRACT);
    const patched = await store.version("invoice", { note: "noop patch" });
    expect(patched.fields).toEqual(BASE_CONTRACT.fields);
    expect(patched.invariants).toEqual(BASE_CONTRACT.invariants);
    expect(patched.version).toBe(2);
  });

  it("throws a clear Error when versioning a missing sutId", async () => {
    await expect(
      store.version("ghost-sut", { note: "should throw" }),
    ).rejects.toThrow("ghost-sut");
  });
});
