import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { proctorRun } from "@proctor/workflows";
import type { ChangeContext } from "@proctor/shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { modelLabel?: string; changeId?: string };
  const modelLabel = body.modelLabel === "degraded" ? "degraded" : "good";
  const changeId = body.changeId ?? crypto.randomUUID().slice(0, 8);

  const change: ChangeContext = {
    changeId,
    sutId: "invoice",
    touched: modelLabel === "degraded" ? ["model"] : [],
  };

  const run = await start(proctorRun, [change, modelLabel]);
  return NextResponse.json({ runId: run.runId, changeId });
}
