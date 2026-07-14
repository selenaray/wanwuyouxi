import { NextResponse } from "next/server";

import { requireRequestSessionId } from "@/server/auth/session";
import { CaseService } from "@/server/cases/service";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { getImageStorage } from "@/server/storage";

export async function GET(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const traceId = crypto.randomUUID();
  try {
    const { db } = await getRuntimeDatabase();
    const sessionId = await requireRequestSessionId(request, db);
    const { caseId } = await context.params;
    const data = await new CaseService(db, getImageStorage()).getPlayerCase(caseId, sessionId);
    return NextResponse.json({ ok: true, data, traceId });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "CASE_NOT_FOUND", message: "未找到案件", retryable: false }, traceId },
      { status: 404 },
    );
  }
}

