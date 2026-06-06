import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { learnAndStore } from "@proctor/workflows";

export const dynamic = "force-dynamic";

export async function POST() {
  const run = await start(learnAndStore, [{ id: "invoice", modelLabel: "good" }]);
  return NextResponse.json({ runId: run.runId });
}
