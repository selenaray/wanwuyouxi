// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    const onJobCreated = vi.fn();
    const POST = createGenerationJobsRoute({
      db: database.db,
      resolveSessionId: async () => sessionId,
      onJobCreated,
      now: () => new Date("2026-07-19T08:00:00.000Z"),
      dailyGenerationLimit: 3,
    });
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
    expect(onJobCreated).toHaveBeenCalledWith(firstBody.data.jobId);
  });

  it("limits new jobs to three per Shanghai day but permits an idempotent replay", async () => {
    const onJobCreated = vi.fn();
    const imageIds = await Promise.all([
      Promise.resolve(imageId),
      database.seedImageAsset(sessionId, "job-route-photo-2"),
      database.seedImageAsset(sessionId, "job-route-photo-3"),
      database.seedImageAsset(sessionId, "job-route-photo-4"),
    ]);
    const POST = createGenerationJobsRoute({
      db: database.db,
      resolveSessionId: async () => sessionId,
      onJobCreated,
      now: () => new Date("2026-07-19T08:00:00.000Z"),
      dailyGenerationLimit: 3,
    });
    const request = (index: number) => new Request("http://test/api/generation-jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `capture-${index}` },
      body: JSON.stringify({ imageId: imageIds[index] }),
    });

    const accepted = await Promise.all([0, 1, 2].map((index) => POST(request(index))));
    const firstBody = await accepted[0].json();
    const blocked = await POST(request(3));
    const blockedBody = await blocked.json();
    const replay = await POST(request(0));
    const replayBody = await replay.json();

    expect(accepted.map((response) => response.status)).toEqual([202, 202, 202]);
    expect(blocked.status).toBe(429);
    expect(blockedBody.error.code).toBe("DAILY_CASE_LIMIT_REACHED");
    expect(replay.status).toBe(202);
    expect(replayBody.data.jobId).toBe(firstBody.data.jobId);
    expect(onJobCreated).toHaveBeenCalledTimes(4);
  });
});
