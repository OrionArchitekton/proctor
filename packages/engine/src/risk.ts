import type { RiskScore, ChangeContext } from "@proctor/shared";

// ── public types ───────────────────────────────────────────────────────────

export interface RiskHistory {
  recentFailures: number;
}

// ── risk scorer ────────────────────────────────────────────────────────────

/**
 * Pure, deterministic risk scorer. No I/O, no randomness, no Date.now().
 *
 * Scoring rules (additive):
 *   - history.recentFailures > 0  →  +recentFailures*2, reason "<n> recent failures (+<2n>)"
 *   - change.touched includes "model"   →  +3, reason "model changed (+3)"
 *   - change.touched includes "prompt"  →  +3, reason "prompt changed (+3)"
 *   - change.touched includes "schema"  →  +2, reason "schema changed (+2)"
 */
export function scoreRisk(
  sutId: string,
  history: RiskHistory,
  change: ChangeContext,
): RiskScore {
  let score = 0;
  const reasons: string[] = [];

  // failure history contribution
  if (history.recentFailures > 0) {
    const delta = history.recentFailures * 2;
    score += delta;
    reasons.push(`${history.recentFailures} recent failures (+${delta})`);
  }

  // change impact contributions
  if (change.touched.includes("model")) {
    score += 3;
    reasons.push("model changed (+3)");
  }
  if (change.touched.includes("prompt")) {
    score += 3;
    reasons.push("prompt changed (+3)");
  }
  if (change.touched.includes("schema")) {
    score += 2;
    reasons.push("schema changed (+2)");
  }

  return { sutId, score, reasons };
}

// ── order by risk ──────────────────────────────────────────────────────────

/**
 * Returns sutIds sorted by score descending.
 * Stable: equal scores preserve the original input order.
 */
export function orderByRisk(scores: RiskScore[]): string[] {
  // Tag each element with its original index to implement a stable sort.
  return scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const diff = b.s.score - a.s.score;
      // When scores are equal, preserve original order via index comparison.
      return diff !== 0 ? diff : a.i - b.i;
    })
    .map(({ s }) => s.sutId);
}
