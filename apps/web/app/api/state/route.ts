import { NextResponse } from "next/server";
import { ContractStore } from "@proctor/engine";
import { LocalGateway } from "@proctor/uipath";
import type { Contract, GovernanceEvent } from "@proctor/shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseDir =
    process.env["PROCTOR_DATA_DIR"] ?? process.cwd() + "/contracts";

  const store = new ContractStore(baseDir);
  let contracts: Contract[] = [];
  try {
    const c = await store.load("invoice");
    if (c) contracts = [c];
  } catch (error) {
    // contract not yet learned — return empty, but log genuine load errors
    console.error("Failed to load contract for invoice:", error);
  }

  let events: GovernanceEvent[] = [];
  try {
    const gateway = new LocalGateway(baseDir);
    events = await gateway.recentEvents(200);
  } catch (error) {
    // gateway error — return empty, but log for operator diagnosis
    console.error("Failed to load governance events:", error);
  }

  return NextResponse.json({ contracts, events });
}
