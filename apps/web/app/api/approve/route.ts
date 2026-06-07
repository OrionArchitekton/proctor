import { NextResponse } from "next/server";
import { resumeHook } from "workflow/api";
import { ApprovalDecisionSchema } from "@proctor/shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let bodyObj: Record<string, unknown>;
  try {
    bodyObj = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { token } = bodyObj as { token?: string };
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const parsed = ApprovalDecisionSchema.safeParse(bodyObj);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  await resumeHook(token, parsed.data);
  return NextResponse.json({ ok: true });
}
