import { NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";
import { proctorRun } from "@proctor/workflows";
import type { ChangeContext } from "@proctor/shared";

export const dynamic = "force-dynamic";

const RunRequestSchema = z.object({
  modelLabel: z.enum(["good", "degraded"]).optional(),
  changeId: z.string().optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RunRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const modelLabel = parsed.data.modelLabel === "degraded" ? "degraded" : "good";
  // Full UUID — truncation to 8 hex chars risks changeId collisions across cycles.
  const changeId = parsed.data.changeId ?? crypto.randomUUID();

  const change: ChangeContext = {
    changeId,
    sutId: "invoice",
    touched: modelLabel === "degraded" ? ["model"] : [],
  };

  try {
    const run = await start(proctorRun, [change, modelLabel]);
    return NextResponse.json({ runId: run.runId, changeId });
  } catch (error) {
    console.error("Failed to start proctorRun workflow:", error);
    return NextResponse.json(
      { error: "Failed to start run workflow" },
      { status: 500 },
    );
  }
}
