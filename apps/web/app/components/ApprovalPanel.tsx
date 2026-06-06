"use client";

import type { GovernanceEvent } from "@proctor/shared";

interface ApprovalPanelProps {
  events: GovernanceEvent[];
  lastChangeId: string | null;
  onApprove: (token: string, approved: boolean) => void;
  loading: boolean;
}

interface ApprovalPayload {
  kind?: string;
  rationale?: string;
  proposedContractPatch?: unknown;
}

export default function ApprovalPanel({ events, lastChangeId, onApprove, loading }: ApprovalPanelProps) {
  // Find the most recent approval_task_opened that hasn't been followed by a cycle_result
  // or an explicit resolution. We use a simple heuristic: any approval_task_opened event
  // for the current changeId that appears after the last triggered_run for that changeId.
  const pendingEvents = events.filter((e) => e.type === "approval_task_opened");
  const lastApproval = pendingEvents[pendingEvents.length - 1] as GovernanceEvent | undefined;

  if (!lastApproval || !lastChangeId) {
    return null;
  }

  const payload = lastApproval.payload as ApprovalPayload;
  const token = `approve:${lastApproval.sutId}:${lastChangeId}`;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Approval Required</h2>
        <span className="badge badge-governance" style={{ borderColor: "var(--warn)", color: "var(--warn)", background: "var(--warn-bg)" }}>
          pending
        </span>
      </div>
      <div className="card-body">
        <div className="verdict-box">
          <div className="verdict-kind">{payload.kind ?? "drift"}</div>
          <div className="verdict-rationale">
            {payload.rationale ?? "Proctor detected a contract deviation. Review and approve or reject."}
          </div>
        </div>
        <p style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "8px" }}>
          Token: <code style={{ fontFamily: "monospace", background: "var(--bg)", padding: "1px 5px", borderRadius: "3px", border: "1px solid var(--border)" }}>{token}</code>
        </p>
        <div className="approval-actions">
          <button
            className="btn btn-pass"
            onClick={() => onApprove(token, true)}
            disabled={loading}
          >
            {loading ? <span className="spinner" style={{ borderTopColor: "var(--pass)" }} /> : "✓"} Approve
          </button>
          <button
            className="btn btn-fail"
            onClick={() => onApprove(token, false)}
            disabled={loading}
          >
            {loading ? <span className="spinner" style={{ borderTopColor: "var(--fail)" }} /> : "✗"} Reject
          </button>
        </div>
      </div>
    </div>
  );
}
