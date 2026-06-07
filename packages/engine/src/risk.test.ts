import { describe, it, expect } from "vitest";
import type { RiskScore } from "@proctor/shared";
import { scoreRisk, orderByRisk } from "./risk";

describe("scoreRisk", () => {
  it("invoice with 2 recent failures and model touched → score 7, 2 reasons", () => {
    const result = scoreRisk(
      "invoice",
      { recentFailures: 2 },
      { changeId: "c1", sutId: "invoice", touched: ["model"] },
    );
    expect(result.sutId).toBe("invoice");
    expect(result.score).toBe(7); // 2*2 + 3
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[0]).toBe("2 recent failures (+4)");
    expect(result.reasons[1]).toBe("model changed (+3)");
  });

  it("no failures, no touched fields → score 0, no reasons", () => {
    const result = scoreRisk(
      "sut-a",
      { recentFailures: 0 },
      { changeId: "c2", sutId: "sut-a", touched: [] },
    );
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("prompt and schema both touched → +3 +2 = 5", () => {
    const result = scoreRisk(
      "sut-b",
      { recentFailures: 0 },
      { changeId: "c3", sutId: "sut-b", touched: ["prompt", "schema"] },
    );
    expect(result.score).toBe(5);
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons).toContain("prompt changed (+3)");
    expect(result.reasons).toContain("schema changed (+2)");
  });

  it("model + prompt + schema all touched → +3 +3 +2 = 8", () => {
    const result = scoreRisk(
      "sut-c",
      { recentFailures: 0 },
      { changeId: "c4", sutId: "sut-c", touched: ["model", "prompt", "schema"] },
    );
    expect(result.score).toBe(8);
    expect(result.reasons).toHaveLength(3);
  });

  it("1 recent failure adds 2 and 1 reason", () => {
    const result = scoreRisk(
      "sut-d",
      { recentFailures: 1 },
      { changeId: "c5", sutId: "sut-d", touched: [] },
    );
    expect(result.score).toBe(2);
    expect(result.reasons).toEqual(["1 recent failures (+2)"]);
  });

  it("unknown touched value is ignored", () => {
    const result = scoreRisk(
      "sut-e",
      { recentFailures: 0 },
      { changeId: "c6", sutId: "sut-e", touched: ["config", "unknown-thing"] },
    );
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
  });
});

describe("orderByRisk", () => {
  it("sorts by score descending", () => {
    const scores: RiskScore[] = [
      { sutId: "a", score: 1, reasons: [] },
      { sutId: "b", score: 9, reasons: [] },
      { sutId: "c", score: 5, reasons: [] },
    ];
    expect(orderByRisk(scores)).toEqual(["b", "c", "a"]);
  });

  it("preserves input order for ties (stable sort)", () => {
    const scores: RiskScore[] = [
      { sutId: "x", score: 5, reasons: [] },
      { sutId: "y", score: 5, reasons: [] },
      { sutId: "z", score: 5, reasons: [] },
    ];
    // All equal: input order must be preserved
    expect(orderByRisk(scores)).toEqual(["x", "y", "z"]);
  });

  it("tie at top preserves relative order before lower scores", () => {
    const scores: RiskScore[] = [
      { sutId: "first", score: 10, reasons: [] },
      { sutId: "second", score: 10, reasons: [] },
      { sutId: "third", score: 3, reasons: [] },
    ];
    expect(orderByRisk(scores)).toEqual(["first", "second", "third"]);
  });

  it("empty input returns empty array", () => {
    expect(orderByRisk([])).toEqual([]);
  });

  it("single item returns that item's sutId", () => {
    expect(orderByRisk([{ sutId: "only", score: 7, reasons: [] }])).toEqual(["only"]);
  });
});
