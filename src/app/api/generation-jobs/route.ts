import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { findSessionByCookie } from "@/server/auth/session";
import type { AppDatabase } from "@/server/db/client";
import { GenerationJobRepository } from "@/server/db/repositories";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { imageAssets } from "@/server/db/schema";

type Dependencies = {
  db: AppDatabase;
  resolveSessionId(request: Request): Promise<string>;
};

const BodySchema = z.object({ imageId: z.string().uuid() });

export function createGenerationJobsRoute(dependencies: Dependencies) {
  return async function POST(request: Request) {
    const traceId = crypto.randomUUID();
    try {
      const sessionId = await dependencies.resolveSessionId(request);
      const idempotencyKey = request.headers.get("idempotency-key")?.trim();
      if (!idempotencyKey || idempotencyKey.length > 80) throw new Error("INVALID_REQUEST");
      const { imageId } = BodySchema.parse(await request.json());
      const [image] = await dependencies.db
        .select()
        .from(imageAssets)
        .where(and(eq(imageAssets.id, imageId), eq(imageAssets.sessionId, sessionId)))
        .limit(1);
      if (!image || image.deletedAt) throw new Error("IMAGE_NOT_FOUND");

      const job = await new GenerationJobRepository(dependencies.db).createGenerationJob({
        sessionId,
        imageAssetId: image.id,
        imageSha256: image.sha256,
        idempotencyKey,
      });
      return NextResponse.json(
        { ok: true, data: { jobId: job.id, status: job.status }, traceId },
        { status: 202 },
      );
    } catch (error) {
      const unauthorized = error instanceof Error && error.message === "INVALID_SESSION";
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: unauthorized ? "UNAUTHORIZED" : "GENERATION_JOB_CREATE_FAILED",
            message: unauthorized ? "请重新开始体验" : "暂时无法开始生成，请重试",
            retryable: !unauthorized,
          },
          traceId,
        },
        { status: unauthorized ? 401 : 400 },
      );
    }
  };
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  return header.split(";").map((part) => part.trim().split("=")).find(([key]) => key === name)?.slice(1).join("=") ?? null;
}

export async function POST(request: Request) {
  const { db } = await getRuntimeDatabase();
  return createGenerationJobsRoute({
    db,
    resolveSessionId: async (incoming) => {
      const cookie = readCookie(incoming, "wy_session");
      if (!cookie) throw new Error("INVALID_SESSION");
      return (await findSessionByCookie(db, cookie, process.env.SESSION_SECRET ?? "")).id;
    },
  })(request);
}

