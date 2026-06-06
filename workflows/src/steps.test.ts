import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

// Set env vars before importing anything that reads them
process.env["PROCTOR_FAKE_LLM"] = "1";
process.env["PROCTOR_GATEWAY"] = "local";

import {
  learnContractStep,
  saveContractStep,
  loadContractStep,
  runContractStep,
  classifyDriftStep,
  notifyReviewerStep,
  pushToUiPathStep,
} from "./steps.js";

import { loadFixtures } from "@proctor/sut-invoice";
import { LocalGateway } from "@proctor/uipath";

let dataDir: string;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "proctor-steps-test-"));
  process.env["PROCTOR_DATA_DIR"] = dataDir;
});

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("learnContractStep + saveContractStep + loadContractStep", () => {
  it("learns a contract with fields and invariants, then round-trips it", async () => {
    const sut = { id: "invoice", modelLabel: "good" };
    const fixtures = loadFixtures();

    const contract = await learnContractStep(sut, fixtures);

    // Should have fields
    expect(contract.fields.length).toBeGreaterThan(0);
    // Should have invariants
    expect(contract.invariants.length).toBeGreaterThan(0);
    // sutId should match
    expect(contract.sutId).toBe("invoice");

    // Round-trip: save then load
    await saveContractStep(contract);
    const loaded = await loadContractStep("invoice");

    expect(loaded).not.toBeNull();
    expect(loaded!.sutId).toBe("invoice");
    expect(loaded!.fields).toEqual(contract.fields);
    expect(loaded!.invariants).toEqual(contract.invariants);
    expect(loaded!.version).toBe(contract.version);
  });
});

describe("runContractStep", () => {
  let goodContract: Awaited<ReturnType<typeof learnContractStep>>;

  beforeAll(async () => {
    const sut = { id: "invoice", modelLabel: "good" };
    const fixtures = loadFixtures();
    goodContract = await learnContractStep(sut, fixtures);
    await saveContractStep(goodContract);
  });

  it("passes with good model", async () => {
    const sut = { id: "invoice", modelLabel: "good" };
    const fixtures = loadFixtures();
    const report = await runContractStep(sut, goodContract, fixtures);
    expect(report.allPassed).toBe(true);
  });

  it("fails with degraded model (sum invariant violated)", async () => {
    const sut = { id: "invoice", modelLabel: "degraded" };
    const fixtures = loadFixtures();
    const report = await runContractStep(sut, goodContract, fixtures);
    expect(report.allPassed).toBe(false);
  });
});

describe("classifyDriftStep", () => {
  it("classifies invariant violation as real-regression", async () => {
    const goodSut = { id: "invoice", modelLabel: "good" };
    const degradedSut = { id: "invoice", modelLabel: "degraded" };
    const fixtures = loadFixtures();

    const contract = await learnContractStep(goodSut, fixtures);
    await saveContractStep(contract);

    const goodReport = await runContractStep(goodSut, contract, fixtures);
    const degradedReport = await runContractStep(degradedSut, contract, fixtures);

    const verdict = await classifyDriftStep(degradedReport, goodReport);
    expect(verdict.kind).toBe("real-regression");
  });
});

describe("notifyReviewerStep + pushToUiPathStep", () => {
  it("notifyReviewerStep returns a task id string", async () => {
    const sut = { id: "invoice", modelLabel: "degraded" };
    const verdict = {
      kind: "real-regression" as const,
      rationale: "invariant violated: sum_line_items_eq_total",
    };

    const taskId = await notifyReviewerStep(sut, verdict);
    expect(typeof taskId).toBe("string");
    expect(taskId.length).toBeGreaterThan(0);
  });

  it("pushToUiPathStep records a governance event", async () => {
    const sut = { id: "invoice", modelLabel: "good" };
    const fixtures = loadFixtures();
    const contract = await learnContractStep(sut, fixtures);
    const report = await runContractStep(sut, contract, fixtures);

    await pushToUiPathStep(sut, report);

    // Verify event was recorded via LocalGateway
    const gateway = new LocalGateway(dataDir);
    const events = await gateway.recentEvents();
    const cycleEvents = events.filter((e) => e.type === "cycle_result" && e.sutId === "invoice");
    expect(cycleEvents.length).toBeGreaterThan(0);
    const last = cycleEvents[cycleEvents.length - 1]!;
    expect((last.payload as Record<string, unknown>)["allPassed"]).toBe(true);
  });
});
