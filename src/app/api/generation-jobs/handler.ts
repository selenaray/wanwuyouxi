import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { AppDatabase } from "@/server/db/client";
import { GenerationJobRepository } from "@/server/db/repositories";
import { imageAssets } from "@/server/db/schema";
import { startOfShanghaiDay } from "@/server/usage/daily-window";

export type GenerationJobsRouteDependencies = {
  db: AppDatabase;
  resolveSessionId(request: Request): Promise<string>;
  onJobCreated?(jobId: string): void | Promise<void>;
  now(): Date;
  dailyGenerationLimit: number;
};

const BodySchema = z.object({ imageId: z.string().uuid() });

export function createGenerationJobsRoute(dependencies: GenerationJobsRouteDependencies) {
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

      const repository = new GenerationJobRepository(dependencies.db);
      const result = await repository.createWithinDailyLimit(
        {
          sessionId,
          imageAssetId: image.id,
          imageSha256: image.sha256,
          idempotencyKey,
        },
        startOfShanghaiDay(dependencies.now()),
        dependencies.dailyGenerationLimit,
      );
      if (result.limited || !result.job) {
        return NextResponse.json({
          ok: false,
          error: {
            code: "DAILY_CASE_LIMIT_REACHED",
            message: "今天的真实案件体验次数已用完，明天再来吧",
            retryable: false,
          },
          traceId,
        }, { status: 429 });
      }
      const job = result.job;
      try {
        void Promise.resolve(dependencies.onJobCreated?.(job.id)).catch(() => {
          console.error("inline generation failed");
        });
      } catch {
        console.error("inline generation failed to start");
      }
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
