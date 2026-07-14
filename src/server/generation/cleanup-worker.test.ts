// @vitest-environment node

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDatabase, type TestDatabase } from "../../../tests/helpers/database";
import { cases, generationJobs, imageAssets } from "@/server/db/schema";
import { fakePrivateCase } from "@/server/providers/fake";
import type { ImageStorage } from "@/server/storage";

import { deleteExpiredImages } from "./cleanup-worker";

describe("deleteExpiredImages", () => {
  let database: TestDatabase;
  let imageId: string;
  let storage: ImageStorage;
  let deleteMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    database = await createTestDatabase();
    const sessionId = await database.seedSession();
    imageId = await database.seedImageAsset(sessionId, "e".repeat(64));
    deleteMock = vi.fn().mockResolvedValue(undefined);
    storage = { put: vi.fn(), createReadUrl: vi.fn(), delete: deleteMock } as ImageStorage;
  });

  afterEach(async () => database.close());

  it("deletes expired images and is safe to repeat", async () => {
    const now = new Date("2026-07-14T01:00:00.000Z");
    await deleteExpiredImages(database.db, storage, now);
    await deleteExpiredImages(database.db, storage, now);

    expect(deleteMock).toHaveBeenCalledTimes(1);
    const [image] = await database.db.select().from(imageAssets).where(eq(imageAssets.id, imageId));
    expect(image.deletedAt).toEqual(now);
  });

  it("leaves a transient failure queued for the next run", async () => {
    deleteMock.mockRejectedValueOnce(new Error("OSS_TIMEOUT")).mockResolvedValueOnce(undefined);
    const now = new Date("2026-07-14T01:00:00.000Z");

    await expect(deleteExpiredImages(database.db, storage, now)).resolves.toMatchObject({ failed: 1 });
    await expect(deleteExpiredImages(database.db, storage, now)).resolves.toMatchObject({ deleted: 1 });
    expect(deleteMock).toHaveBeenCalledTimes(2);
  });

  it("treats an already-missing object as deleted", async () => {
    deleteMock.mockRejectedValueOnce(new Error("IMAGE_NOT_FOUND"));

    await expect(deleteExpiredImages(database.db, storage, new Date("2026-07-14T01:00:00.000Z")))
      .resolves.toMatchObject({ deleted: 1, failed: 0 });
  });

  it("retains a generated case after deleting its source image", async () => {
    const [image] = await database.db.select().from(imageAssets).where(eq(imageAssets.id, imageId));
    const [job] = await database.db.insert(generationJobs).values({
      sessionId: image.sessionId,
      imageAssetId: image.id,
      imageSha256: image.sha256,
      idempotencyKey: "retention-test",
      status: "SUCCEEDED",
    }).returning();
    const [published] = await database.db.insert(cases).values({
      jobId: job.id,
      sessionId: image.sessionId,
      privatePayload: fakePrivateCase,
    }).returning();

    await deleteExpiredImages(database.db, storage, new Date("2026-07-14T01:00:00.000Z"));

    await expect(database.db.select().from(cases).where(eq(cases.id, published.id)))
      .resolves.toHaveLength(1);
  });
});
