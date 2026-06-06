import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalGateway } from "./local.js";
import { getGateway } from "./gateway.js";
import type { SutRef, TestReport, DriftVerdict, GovernanceEvent } from "@proctor/shared";

// ── fixtures ──────────────────────────────────────────────────────────────────
const SUT: SutRef = { id: "sut-invoice", modelLabel: "gpt-4o" };

const REPORT: TestReport = {
  sutId: "sut-invoice",
  allPassed: true,
  results: [{ field: "total", kind: "structural", passed: true, evidence: "matched" }],
  rawOutputs: [{ total: 42 }],
};

const VERDICT: DriftVerdict = {
  kind: "legitimate-evolution",
  rationale: "New field added",
};

// ── helpers ───────────────────────────────────────────────────────────────────
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "proctor-uipath-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("LocalGateway.pushTestResult", () => {
  it("records a test_result governance event and is visible via recentEvents", async () => {
    const gw = new LocalGateway(tmpDir);
    await gw.pushTestResult(SUT, REPORT);
    const events = await gw.recentEvents();
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe("test_result");
    expect(events[0]?.sutId).toBe(SUT.id);
    expect((events[0]?.payload as { allPassed: boolean }).allPassed).toBe(true);
  });
});

describe("LocalGateway.recordGovernanceEvent", () => {
  it("round-trips through recentEvents", async () => {
    const gw = new LocalGateway(tmpDir);
    const evt: GovernanceEvent = {
      ts: new Date().toISOString(),
      sutId: "sut-a",
      type: "custom_event",
      payload: { foo: "bar" },
    };
    await gw.recordGovernanceEvent(evt);
    const events = await gw.recentEvents();
    expect(events.length).toBe(1);
    expect(events[0]).toEqual(evt);
  });
});

describe("LocalGateway.openApprovalTask", () => {
  it("returns task-<sutId>-0 first time, task-<sutId>-1 second time", async () => {
    const gw = new LocalGateway(tmpDir);
    const t0 = await gw.openApprovalTask(SUT, VERDICT);
    const t1 = await gw.openApprovalTask(SUT, VERDICT);
    expect(t0).toBe(`task-${SUT.id}-0`);
    expect(t1).toBe(`task-${SUT.id}-1`);
  });

  it("logs both approval_task_opened events", async () => {
    const gw = new LocalGateway(tmpDir);
    await gw.openApprovalTask(SUT, VERDICT);
    await gw.openApprovalTask(SUT, VERDICT);
    const events = await gw.recentEvents();
    const approvals = events.filter((e) => e.type === "approval_task_opened");
    expect(approvals.length).toBe(2);
  });
});

describe("LocalGateway.recentEvents on missing log", () => {
  it("returns empty array when governance log does not exist", async () => {
    // Use a sub-dir that was never written to
    const gw = new LocalGateway(join(tmpDir, "nonexistent"));
    const events = await gw.recentEvents();
    expect(events).toEqual([]);
  });
});

describe("LocalGateway.triggeredRun", () => {
  it("returns a runId prefixed local-run- and logs triggered_run event", async () => {
    const gw = new LocalGateway(tmpDir);
    const handle = await gw.triggeredRun({ changeId: "c1", sutId: SUT.id, touched: ["file.ts"] });
    expect(handle.runId).toBe("local-run-c1");
    const events = await gw.recentEvents();
    expect(events.some((e) => e.type === "triggered_run")).toBe(true);
  });
});

describe("getGateway() factory", () => {
  let savedGateway: string | undefined;
  let savedBase: string | undefined;
  let savedBaseUrl: string | undefined;
  let savedTenant: string | undefined;
  let savedPat: string | undefined;

  beforeEach(() => {
    savedGateway = process.env["PROCTOR_GATEWAY"];
    savedBase = process.env["PROCTOR_DATA_DIR"];
    savedBaseUrl = process.env["UIPATH_BASE_URL"];
    savedTenant = process.env["UIPATH_TENANT"];
    savedPat = process.env["UIPATH_PAT"];
  });

  afterEach(() => {
    restoreEnv("PROCTOR_GATEWAY", savedGateway);
    restoreEnv("PROCTOR_DATA_DIR", savedBase);
    restoreEnv("UIPATH_BASE_URL", savedBaseUrl);
    restoreEnv("UIPATH_TENANT", savedTenant);
    restoreEnv("UIPATH_PAT", savedPat);
  });

  function restoreEnv(key: string, val: string | undefined) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }

  it("returns LocalGateway when PROCTOR_GATEWAY is unset", () => {
    delete process.env["PROCTOR_GATEWAY"];
    process.env["PROCTOR_DATA_DIR"] = tmpDir;
    const gw = getGateway();
    expect(gw).toBeInstanceOf(LocalGateway);
  });

  it("returns LocalGateway when PROCTOR_GATEWAY=local", () => {
    process.env["PROCTOR_GATEWAY"] = "local";
    process.env["PROCTOR_DATA_DIR"] = tmpDir;
    const gw = getGateway();
    expect(gw).toBeInstanceOf(LocalGateway);
  });

  it("returns TestCloudGateway when PROCTOR_GATEWAY=testcloud", async () => {
    process.env["PROCTOR_GATEWAY"] = "testcloud";
    // Do NOT set UIPATH_* so we can verify the error path
    delete process.env["UIPATH_BASE_URL"];
    delete process.env["UIPATH_TENANT"];
    delete process.env["UIPATH_PAT"];

    const { TestCloudGateway } = await import("./testcloud.js");
    const gw = getGateway();
    expect(gw).toBeInstanceOf(TestCloudGateway);
    // Calling a method without creds should reject
    await expect(gw.pushTestResult(SUT, REPORT)).rejects.toThrow(
      "TestCloudGateway requires UIPATH_BASE_URL"
    );
  });
});
