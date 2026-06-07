"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Contract, GovernanceEvent } from "@proctor/shared";
import ContractPanel from "./components/ContractPanel";
import RunPanel from "./components/RunPanel";
import FeedPanel from "./components/FeedPanel";
import ApprovalPanel from "./components/ApprovalPanel";
import ExplainerCard from "./components/ExplainerCard";

interface StateResponse {
  contracts: Contract[];
  events: GovernanceEvent[];
}

interface BootstrapResponse {
  runId: string;
}

interface RunResponse {
  runId: string;
  changeId: string;
}

export default function HomePage() {
  const [contract, setContract] = useState<Contract | null>(null);
  const [events, setEvents] = useState<GovernanceEvent[]>([]);
  const [modelLabel, setModelLabel] = useState<"good" | "degraded">("good");
  const [lastChangeId, setLastChangeId] = useState<string | null>(null);

  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) return;
      const data = (await res.json()) as StateResponse;
      setContract(data.contracts[0] ?? null);
      setEvents(data.events);
    } catch {
      // silently ignore poll errors
    }
  }, []);

  useEffect(() => {
    void fetchState();
    pollRef.current = setInterval(() => { void fetchState(); }, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchState]);

  const handleBootstrap = async () => {
    setBootstrapLoading(true);
    try {
      const res = await fetch("/api/bootstrap", { method: "POST" });
      if (!res.ok) {
        console.error("Bootstrap failed", await res.text());
      }
      await fetchState();
    } catch (e) {
      console.error(e);
    } finally {
      setBootstrapLoading(false);
    }
  };

  const handleRun = async () => {
    setRunLoading(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelLabel }),
      });
      if (!res.ok) {
        console.error("Run failed", await res.text());
      } else {
        const data = (await res.json()) as RunResponse;
        setLastChangeId(data.changeId);
      }
      await fetchState();
    } catch (e) {
      console.error(e);
    } finally {
      setRunLoading(false);
    }
  };

  const handleApprove = async (token: string, approved: boolean) => {
    setApproveLoading(true);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, approved, reviewer: "dashboard-user" }),
      });
      if (!res.ok) {
        console.error("Approve failed", await res.text());
      }
      await fetchState();
    } catch (e) {
      console.error(e);
    } finally {
      setApproveLoading(false);
    }
  };

  return (
    <div className="page-root">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1>Proctor — the agent that QAs other agents</h1>
          <p className="subtitle">
            Contract-based regression detection · drift classification · governance-plane approval loop
          </p>
        </div>
        <span className="badge badge-governance">UiPath governance plane</span>
      </header>

      {/* Main grid */}
      <div className="main-grid">
        {/* Left: contract */}
        <ContractPanel
          contract={contract}
          onBootstrap={() => void handleBootstrap()}
          loading={bootstrapLoading}
        />

        {/* Right: run + feed + approval */}
        <div className="right-col">
          <RunPanel
            modelLabel={modelLabel}
            onToggle={setModelLabel}
            onRun={() => void handleRun()}
            loading={runLoading}
          />
          <FeedPanel events={events} />
          <ApprovalPanel
            events={events}
            lastChangeId={lastChangeId}
            onApprove={(token, approved) => void handleApprove(token, approved)}
            loading={approveLoading}
          />
          <ExplainerCard />
        </div>
      </div>
    </div>
  );
}
