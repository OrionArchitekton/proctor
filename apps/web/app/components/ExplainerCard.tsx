"use client";

export default function ExplainerCard() {
  return (
    <div className="card">
      <div className="card-header">
        <h2>Legitimate-Evolution Mode</h2>
        <span className="badge badge-governance">narrator beat</span>
      </div>
      <div className="card-body">
        <p className="explainer">
          Proctor&apos;s drift classifier distinguishes <strong>real regressions</strong> from{" "}
          <strong>legitimate evolution</strong>. When a model change is intentional — a new field, a
          relaxed constraint, an improved format — Proctor classifies the drift as{" "}
          <em>legitimate-evolution</em> and proposes a contract patch rather than blocking the deploy.
          Only genuine regressions trigger a hold.
        </p>
      </div>
    </div>
  );
}
