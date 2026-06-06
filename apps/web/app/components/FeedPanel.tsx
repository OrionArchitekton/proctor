"use client";

import type { GovernanceEvent } from "@proctor/shared";

interface FeedPanelProps {
  events: GovernanceEvent[];
}

interface FeedItemStyle {
  className: string;
  icon: string;
}

type PayloadWithAllPassed = { allPassed?: boolean };
type PayloadWithKind = { kind?: string; rationale?: string };
type PayloadWithChangeId = { changeId?: string; runIds?: string[] };

function styleForEvent(evt: GovernanceEvent): FeedItemStyle {
  switch (evt.type) {
    case "test_result": {
      const p = evt.payload as PayloadWithAllPassed;
      return p.allPassed
        ? { className: "feed-item-pass", icon: "✓" }
        : { className: "feed-item-fail", icon: "✗" };
    }
    case "cycle_result":
      return { className: "feed-item-pass", icon: "↺" };
    case "approval_task_opened":
      return { className: "feed-item-warn", icon: "⚠" };
    case "triggered_run":
      return { className: "feed-item-info", icon: "▶" };
    default:
      return { className: "feed-item-info", icon: "·" };
  }
}

function describeEvent(evt: GovernanceEvent): { title: string; meta: string } {
  switch (evt.type) {
    case "test_result": {
      const p = evt.payload as PayloadWithAllPassed & { results?: { field: string; passed: boolean }[] };
      const passed = p.results?.filter((r) => r.passed).length ?? 0;
      const total = p.results?.length ?? 0;
      return {
        title: p.allPassed ? "All assertions passed" : "Regression detected",
        meta: `${passed}/${total} assertions · sut: ${evt.sutId}`,
      };
    }
    case "cycle_result":
      return {
        title: "Proctor cycle complete",
        meta: `sut: ${evt.sutId}`,
      };
    case "approval_task_opened": {
      const p = evt.payload as PayloadWithKind;
      return {
        title: `Approval required — ${p.kind ?? "drift"}`,
        meta: `sut: ${evt.sutId} · ${p.rationale ? p.rationale.slice(0, 60) + (p.rationale.length > 60 ? "…" : "") : ""}`,
      };
    }
    case "triggered_run": {
      const p = evt.payload as PayloadWithChangeId;
      return {
        title: "Run triggered",
        meta: `changeId: ${p.changeId ?? "—"} · sut: ${evt.sutId}`,
      };
    }
    default:
      return {
        title: evt.type,
        meta: `sut: ${evt.sutId}`,
      };
  }
}

function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts.slice(11, 19) ?? "";
  }
}

export default function FeedPanel({ events }: FeedPanelProps) {
  const reversed = [...events].reverse();

  return (
    <div className="card">
      <div className="card-header">
        <h2>Live Feed</h2>
        <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="card-body">
        <div className="feed">
          {reversed.length === 0 ? (
            <p className="feed-empty">No events yet. Run bootstrap or a change.</p>
          ) : (
            reversed.map((evt, i) => {
              const { className, icon } = styleForEvent(evt);
              const { title, meta } = describeEvent(evt);
              return (
                <div className={`feed-item ${className}`} key={i}>
                  <span className="feed-icon">{icon}</span>
                  <div className="feed-content">
                    <div className="feed-title">{title}</div>
                    <div className="feed-meta">{meta}</div>
                  </div>
                  <span className="feed-ts">{formatTs(evt.ts)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
