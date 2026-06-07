"use client";

import type { Contract } from "@proctor/shared";

interface ContractPanelProps {
  contract: Contract | null;
  onBootstrap: () => void;
  loading: boolean;
}

type AssertionKind = "structural" | "exact" | "semantic";

const KIND_LABELS: Record<AssertionKind, string> = {
  structural: "structural",
  exact: "exact",
  semantic: "semantic",
};

export default function ContractPanel({ contract, onBootstrap, loading }: ContractPanelProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>Contract · invoice</h2>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onBootstrap}
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : null}
          {contract ? "Re-learn" : "Bootstrap"}
        </button>
      </div>
      <div className="card-body">
        {!contract ? (
          <p className="contract-empty">
            No contract learned yet.
            <br />
            Click Bootstrap to start.
          </p>
        ) : (
          <>
            <div className="contract-meta">
              <span className="meta-label">Version</span>
              <span className="meta-value">v{contract.version}</span>
            </div>

            <p className="section-label">Field Assertions ({contract.fields.length})</p>
            <div className="fields-list">
              {contract.fields.map((f) => (
                <div className="field-row" key={f.name}>
                  <span className="field-name">{f.name}</span>
                  <span className={`kind-chip kind-${f.kind}`}>
                    {KIND_LABELS[f.kind as AssertionKind] ?? f.kind}
                  </span>
                </div>
              ))}
            </div>

            {contract.invariants.length > 0 && (
              <>
                <p className="section-label">Invariants</p>
                <div className="invariants-list">
                  {contract.invariants.map((inv, i) => (
                    <div className="invariant-item" key={i}>
                      {inv}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
