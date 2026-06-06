import { NextResponse } from "next/server";
import { resumeHook } from "workflow/api";
import { ApprovalDecisionSchema } from "@proctor/shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as unknown;

  const bodyObj = body as Record<string, unknown>;
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
