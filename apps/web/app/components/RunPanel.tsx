"use client";

interface RunPanelProps {
  modelLabel: "good" | "degraded";
  onToggle: (label: "good" | "degraded") => void;
  onRun: () => void;
  loading: boolean;
}

export default function RunPanel({ modelLabel, onToggle, onRun, loading }: RunPanelProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>Run a Change</h2>
      </div>
      <div className="card-body">
        <div className="run-controls">
          <div>
            <p style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Model Quality
            </p>
            <div className="toggle-group">
              <button
                className={`toggle-btn${modelLabel === "good" ? " active-good" : ""}`}
                onClick={() => onToggle("good")}
              >
                good
              </button>
              <button
                className={`toggle-btn${modelLabel === "degraded" ? " active-degraded" : ""}`}
                onClick={() => onToggle("degraded")}
              >
                degraded
              </button>
            </div>
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <button className="btn btn-primary" onClick={onRun} disabled={loading}>
              {loading ? <span className="spinner" /> : null}
              {loading ? "Running…" : "Run change"}
            </button>
          </div>
        </div>
        <p style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-dim)" }}>
          {modelLabel === "degraded"
            ? "Simulates a model degradation — Proctor will detect regressions and open an approval task."
            : "Simulates a clean change — Proctor will verify the contract and pass."}
        </p>
      </div>
    </div>
  );
}
