import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { learnAndStore } from "@proctor/workflows";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const run = await start(learnAndStore, [{ id: "invoice", modelLabel: "good" }]);
    return NextResponse.json({ runId: run.runId });
  } catch (error) {
    console.error("Failed to start bootstrap workflow:", error);
    return NextResponse.json(
      { error: "Failed to start bootstrap workflow" },
      { status: 500 },
    );
  }
}
