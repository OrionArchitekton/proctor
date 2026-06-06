export type AssertionKind = "structural" | "exact" | "semantic";
export interface FieldAssertion { name: string; kind: AssertionKind; tolerance?: number; }
export interface Contract { sutId: string; version: number; fields: FieldAssertion[]; invariants: string[]; }
export interface ContractPatch { fields?: FieldAssertion[]; invariants?: string[]; note: string; }

export interface SutRef { id: string; modelLabel: string; }
export interface AssertionResult { field: string; kind: AssertionKind; passed: boolean; evidence: string; score?: number; }
export interface TestReport { sutId: string; allPassed: boolean; results: AssertionResult[]; rawOutputs: unknown[]; }

export type DriftKind = "real-regression" | "legitimate-evolution" | "flaky";
export interface DriftVerdict { kind: DriftKind; rationale: string; proposedContractPatch?: ContractPatch; }

export interface ApprovalDecision { approved: boolean; reviewer: string; note?: string; }
export interface RiskScore { sutId: string; score: number; reasons: string[]; }
export interface ChangeContext { changeId: string; sutId: string; touched: string[]; }
export interface GovernanceEvent { ts: string; sutId: string; type: string; payload: unknown; }
