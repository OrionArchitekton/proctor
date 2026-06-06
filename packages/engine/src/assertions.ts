import type { AssertionResult } from "@proctor/shared";

export type SemanticJudge = (expected: string, actual: string) => Promise<number>;

export function assertStructural(
  field: string,
  value: unknown,
  type: "number" | "string" | "array",
): AssertionResult {
  const ok = type === "array" ? Array.isArray(value) : typeof value === type;
  return {
    field,
    kind: "structural",
    passed: ok,
    evidence: `typeof ${field}=${Array.isArray(value) ? "array" : typeof value}, expected ${type}`,
  };
}

export function assertExact(
  field: string,
  actual: unknown,
  expected: unknown,
): AssertionResult {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return {
    field,
    kind: "exact",
    passed: ok,
    evidence: `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
  };
}

export async function assertSemantic(
  field: string,
  expected: string,
  actual: string,
  judge: SemanticJudge,
  threshold: number,
): Promise<AssertionResult> {
  const score = await judge(expected, actual);
  return {
    field,
    kind: "semantic",
    passed: score >= threshold,
    score,
    evidence: `similarity=${score.toFixed(2)} threshold=${threshold} ("${expected}" vs "${actual}")`,
  };
}
