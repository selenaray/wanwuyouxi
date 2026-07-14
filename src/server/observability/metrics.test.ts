// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../../../tests/helpers/database";
import { cases, generationJobs } from "@/server/db/schema";
import { fakePrivateCase } from "@/server/providers/fake";

import { getEvaluationSummary, recordModelCall } from "./metrics";

describe("metadata-only generation metrics", () => {
  let database: TestDatabase;
  let jobId: string;

  beforeEach(async () => {
    database = await createTestDatabase();
    const sessionId = await database.seedSession();
    const imageAssetId = await database.seedImageAsset(sessionId, "m".repeat(64));
    const [job] = await database.db.insert(generationJobs).values({
      sessionId,
      imageAssetId,
      imageSha256: "m".repeat(64),
      idempotencyKey: "metrics-test",
      status: "SUCCEEDED",
    }).returning({ id: generationJobs.id });
    jobId = job.id;
  });

  afterEach(async () => database.close());

  it("rejects forbidden metric properties", async () => {
    await expect(recordModelCall(database.db, {
      jobId,
      provider: "qwen",
      model: "qwen3-vl-plus",
      purpose: "VISION",
      latencyMs: 1200,
      success: true,
      imageUrl: "signed-private-url",
    })).rejects.toThrow("FORBIDDEN_METRIC_FIELD");
  });

  it("summarizes success, duration, repair and cost without content", async () => {
    const [job] = await database.db.select().from(generationJobs);
    await database.db.insert(cases).values({
      jobId,
      sessionId: job.sessionId,
      privatePayload: fakePrivateCase,
    });
    await recordModelCall(database.db, {
      jobId,
      provider: "qwen",
      model: "qwen3-vl-plus",
      purpose: "VISION",
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 1200,
      estimatedCostCny: 0.03,
      success: true,
    });
    await recordModelCall(database.db, {
      jobId,
      provider: "deepseek",
      model: "deepseek-chat",
      purpose: "REPAIR",
      latencyMs: 800,
      estimatedCostCny: 0.01,
      success: true,
    });

    await expect(getEvaluationSummary(database.db)).resolves.toMatchObject({
      generationSuccessRate: 1,
      hotspotUsableRate: 1,
      fallbackRate: 0,
      p50DurationMs: 2000,
      p95DurationMs: 2000,
      repairRate: 1,
      averageCostPerSuccessfulGameCny: 0.04,
    });
  });
});
