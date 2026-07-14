// @vitest-environment node

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../../../tests/helpers/database";
import { cases as casesTable } from "@/server/db/schema";
import { CaseRepository, GenerationJobRepository } from "@/server/db/repositories";
import { FakeCaseJudgeProvider, FakeVisionCaseProvider } from "@/server/providers/fake";

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
});

