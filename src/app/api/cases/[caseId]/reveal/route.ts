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
    const data = await new CaseService(db, getImageStorage()).revealCase(caseId, sessionId);
    return NextResponse.json({ ok: true, data, traceId });
  } catch (error) {
    const incomplete = error instanceof Error && error.message === "CASE_NOT_COMPLETED";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: incomplete ? "CASE_NOT_COMPLETED" : "CASE_NOT_FOUND",
          message: incomplete ? "完成推理后才能查看真相" : "未找到案件",
          retryable: false,
        },
        traceId,
      },
      { status: incomplete ? 409 : 404 },
    );
  }
}

