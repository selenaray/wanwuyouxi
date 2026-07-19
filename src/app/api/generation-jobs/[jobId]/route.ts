import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { findSessionByCookie } from "@/server/auth/session";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { cases, generationJobs } from "@/server/db/schema";

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  return header.split(";").map((part) => part.trim().split("=")).find(([key]) => key === name)?.slice(1).join("=") ?? null;
}

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const traceId = crypto.randomUUID();
  try {
    const { db } = await getRuntimeDatabase();
    const cookie = readCookie(request, "wy_session");
    if (!cookie) throw new Error("INVALID_SESSION");
    const session = await findSessionByCookie(db, cookie, process.env.SESSION_SECRET ?? "");
    const { jobId } = await context.params;
    const [row] = await db
      .select({
        id: generationJobs.id,
        status: generationJobs.status,
        caseId: cases.id,
        errorCode: generationJobs.errorCode,
      })
      .from(generationJobs)
      .leftJoin(cases, eq(cases.jobId, generationJobs.id))
      .where(and(eq(generationJobs.id, jobId), eq(generationJobs.sessionId, session.id)))
      .limit(1);
    if (!row) throw new Error("JOB_NOT_FOUND");
    return NextResponse.json({
      ok: true,
      data: { jobId: row.id, status: row.status, caseId: row.caseId, errorCode: row.errorCode },
      traceId,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "JOB_NOT_FOUND", message: "未找到生成任务", retryable: false }, traceId },
      { status: 404 },
    );
  }
}
