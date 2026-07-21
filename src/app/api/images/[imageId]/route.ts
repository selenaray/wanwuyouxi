import { NextResponse } from "next/server";

import { requireRequestSessionId } from "@/server/auth/session";
import { CaseService } from "@/server/cases/service";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { getImageStorage } from "@/server/storage";

export async function DELETE(request: Request, context: { params: Promise<{ imageId: string }> }) {
  const traceId = crypto.randomUUID();
  try {
    const { db } = await getRuntimeDatabase();
    const sessionId = await requireRequestSessionId(request, db);
    const { imageId } = await context.params;
    await new CaseService(db, getImageStorage()).deleteImage(imageId, sessionId);
    return NextResponse.json({ ok: true, data: { deleted: true }, traceId });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "IMAGE_DELETE_FAILED", message: "照片删除失败，请重试", retryable: true },
        traceId,
      },
      { status: 500 },
    );
  }
}

