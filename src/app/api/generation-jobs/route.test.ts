// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../../../../tests/helpers/database";

import { createGenerationJobsRoute } from "./route";

describe("POST /api/generation-jobs", () => {
  let database: TestDatabase;
  let sessionId: string;
  let imageId: string;

  beforeEach(async () => {
    database = await createTestDatabase();
    sessionId = await database.seedSession();
    imageId = await database.seedImageAsset(sessionId, "job-route-photo-hash");
  });

  afterEach(async () => {
    await database.close();
  });

  it("returns immediately with one durable pending job", async () => {
    const POST = createGenerationJobsRoute({ db: database.db, resolveSessionId: async () => sessionId });
    const request = () => new Request("http://test/api/generation-jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "capture-1" },
      body: JSON.stringify({ imageId }),
    });

    const first = await POST(request());
    const second = await POST(request());
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(202);
    expect(firstBody.data.status).toBe("PENDING");
    expect(secondBody.data.jobId).toBe(firstBody.data.jobId);
  });
});
