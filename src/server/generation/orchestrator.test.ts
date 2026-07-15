// @vitest-environment node

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../../../tests/helpers/database";
import { cases as casesTable } from "@/server/db/schema";
import { CaseRepository, GenerationJobRepository } from "@/server/db/repositories";
import { FakeCaseJudgeProvider, FakeVisionCaseProvider } from "@/server/providers/fake";
import { ProviderError, type CaseJudgeProvider } from "@/server/providers/types";

import { runGenerationJob } from "./orchestrator";

describe("runGenerationJob", () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it("publishes a fake-provider case exactly once", async () => {
    const sessionId = await database.seedSession();
    const imageAssetId = await database.seedImageAsset(sessionId, "worker-photo-hash");
    const jobs = new GenerationJobRepository(database.db);
    const job = await jobs.createGenerationJob({
      sessionId,
      imageAssetId,
      imageSha256: "worker-photo-hash",
      idempotencyKey: "worker-capture",
    });
    await jobs.leaseNextJob("worker-a", new Date(), 60);
    const dependencies = {
      jobs,
      cases: new CaseRepository(database.db),
      storage: { createReadUrl: async () => "data:image/jpeg;base64,/9j/", put: async () => ({ key: "unused" }), delete: async () => undefined },
      vision: new FakeVisionCaseProvider(),
      judge: new FakeCaseJudgeProvider(),
    };

    await runGenerationJob(job.id, dependencies);
    await runGenerationJob(job.id, dependencies);

    const published = await database.db.select().from(casesTable).where(eq(casesTable.jobId, job.id));
    expect(published).toHaveLength(1);
    expect((await jobs.getJob(job.id))?.status).toBe("SUCCEEDED");
  });

  it("uses at most one validation and one targeted repair call", async () => {
    const sessionId = await database.seedSession();
    const imageAssetId = await database.seedImageAsset(sessionId, "repair-photo-hash");
    const jobs = new GenerationJobRepository(database.db);
    const job = await jobs.createGenerationJob({
      sessionId,
      imageAssetId,
      imageSha256: "repair-photo-hash",
      idempotencyKey: "repair-capture",
    });
    await jobs.leaseNextJob("worker-repair", new Date(), 60);
    let validationCalls = 0;
    let repairCalls = 0;
    const judge: CaseJudgeProvider = {
      async validateCase() {
        validationCalls += 1;
        return {
          valid: false,
          confidence: 0.7,
          issues: [{ code: "COPY_QUALITY", field: "wrongAnswerHint", message: "提示不够具体" }],
        };
      },
      async repairCase({ game }) {
        repairCalls += 1;
        return { ...game, wrongAnswerHint: "比较三处痕迹覆盖灰尘的先后顺序。" };
      },
    };

    await runGenerationJob(job.id, {
      jobs,
      cases: new CaseRepository(database.db),
      storage: { createReadUrl: async () => "data:image/jpeg;base64,/9j/", put: async () => ({ key: "unused" }), delete: async () => undefined },
      vision: new FakeVisionCaseProvider(),
      judge,
    });

    expect(validationCalls).toBe(1);
    expect(repairCalls).toBe(1);
    expect((await jobs.getJob(job.id))?.status).toBe("SUCCEEDED");
  });

  it("marks a high-confidence case as judge-degraded when the judge is temporarily unavailable", async () => {
    const sessionId = await database.seedSession();
    const imageAssetId = await database.seedImageAsset(sessionId, "degraded-photo-hash");
    const jobs = new GenerationJobRepository(database.db);
    const job = await jobs.createGenerationJob({
      sessionId,
      imageAssetId,
      imageSha256: "degraded-photo-hash",
      idempotencyKey: "degraded-capture",
    });
    await jobs.leaseNextJob("worker-degraded", new Date(), 60);
    const judge: CaseJudgeProvider = {
      async validateCase() { throw new ProviderError("UNAVAILABLE", "temporary"); },
      async repairCase({ game }) { return game; },
    };

    await runGenerationJob(job.id, {
      jobs,
      cases: new CaseRepository(database.db),
      storage: { createReadUrl: async () => "data:image/jpeg;base64,/9j/", put: async () => ({ key: "unused" }), delete: async () => undefined },
      vision: new FakeVisionCaseProvider(),
      judge,
    });

    const [published] = await database.db.select().from(casesTable).where(eq(casesTable.jobId, job.id));
    expect(published.judgeDegraded).toBe(true);
  });

  it("requeues one transient vision failure and stops after the second attempt", async () => {
    const sessionId = await database.seedSession();
    const imageAssetId = await database.seedImageAsset(sessionId, "retry-photo-hash");
    const jobs = new GenerationJobRepository(database.db);
    const job = await jobs.createGenerationJob({
      sessionId,
      imageAssetId,
      imageSha256: "retry-photo-hash",
      idempotencyKey: "retry-capture",
    });
    const dependencies = {
      jobs,
      cases: new CaseRepository(database.db),
      storage: { createReadUrl: async () => "data:image/jpeg;base64,/9j/", put: async () => ({ key: "unused" }), delete: async () => undefined },
      vision: {
        async generateCase(): Promise<never> {
          throw new ProviderError("UNAVAILABLE", "temporary");
        },
      },
      judge: new FakeCaseJudgeProvider(),
    };

    await jobs.leaseNextJob("worker-retry-1", new Date(), 60);
    await expect(runGenerationJob(job.id, dependencies)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect((await jobs.getJob(job.id))?.status).toBe("PENDING");

    await jobs.leaseNextJob("worker-retry-2", new Date(), 60);
    await expect(runGenerationJob(job.id, dependencies)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect((await jobs.getJob(job.id))?.status).toBe("RETRYABLE_FAILED");
    expect((await jobs.getJob(job.id))?.attemptCount).toBe(2);
  });
});
