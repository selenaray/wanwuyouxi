import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestSessionId } from "@/server/auth/session";
import { CaseService } from "@/server/cases/service";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { getImageStorage } from "@/server/storage";

const AnswerSchema = z.object({ answerIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]) });

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const traceId = crypto.randomUUID();
  try {
    const { db } = await getRuntimeDatabase();
    const sessionId = await requireRequestSessionId(request, db);
    const { caseId } = await context.params;
    const { answerIndex } = AnswerSchema.parse(await request.json());
    const data = await new CaseService(db, getImageStorage()).submitAnswer(caseId, sessionId, answerIndex);
    return NextResponse.json({ ok: true, data, traceId });
  } catch (error) {
    const limited = error instanceof Error && error.message === "ANSWER_LIMIT_REACHED";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: limited ? "ANSWER_LIMIT_REACHED" : "ANSWER_REJECTED",
          message: limited ? "本局答题次数已用完" : "无法提交答案",
          retryable: false,
        },
        traceId,
      },
      { status: limited ? 409 : 400 },
    );
  }
}

