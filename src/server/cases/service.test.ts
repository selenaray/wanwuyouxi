// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../../../tests/helpers/database";
import { CaseRepository, GenerationJobRepository } from "@/server/db/repositories";
import { fakePrivateCase } from "@/server/providers/fake";
import { MemoryImageStorage } from "@/server/storage/memory";

import { CaseService } from "./service";

describe("CaseService", () => {
  let database: TestDatabase;
  let service: CaseService;
  let sessionId: string;
  let imageId: string;
  let caseId: string;
  let storage: MemoryImageStorage;

  beforeEach(async () => {
    database = await createTestDatabase();
    sessionId = await database.seedSession();
    imageId = await database.seedImageAsset(sessionId, "service-photo-hash");
    const jobs = new GenerationJobRepository(database.db);
    const job = await jobs.createGenerationJob({
      sessionId,
      imageAssetId: imageId,
      imageSha256: "service-photo-hash",
      idempotencyKey: "service-capture",
    });
    await jobs.transitionJob(job.id, "PROCESSING");
    await jobs.transitionJob(job.id, "VALIDATING");
    const published = await new CaseRepository(database.db).publishCase({
      jobId: job.id,
      sessionId,
      privateCase: fakePrivateCase,
      judgeDegraded: false,
    });
    caseId = published.id;
    storage = new MemoryImageStorage();
    service = new CaseService(database.db, storage);
  });

  afterEach(async () => {
    await database.close();
  });

  it("returns a player case without answer or truth", async () => {
    const player = await service.getPlayerCase(caseId, sessionId);
    const serialized = JSON.stringify(player);

    expect(player.case.title).toBe(fakePrivateCase.title);
    expect(serialized).not.toContain("correctAnswerIndex");
    expect(serialized).not.toContain(fakePrivateCase.truth);
  });

  it("does not reveal truth before the game is complete", async () => {
    await expect(service.revealCase(caseId, sessionId)).rejects.toThrow("CASE_NOT_COMPLETED");
  });

  it("returns a hint once and reveals after the second attempt", async () => {
    const first = await service.submitAnswer(caseId, sessionId, 0);
    const second = await service.submitAnswer(caseId, sessionId, 1);
    const reveal = await service.revealCase(caseId, sessionId);

    expect(first).toMatchObject({ correct: false, attemptCount: 1, hint: fakePrivateCase.wrongAnswerHint });
    expect(second).toEqual({ correct: false, attemptCount: 2, completed: true });
    expect(reveal).toMatchObject({ truth: fakePrivateCase.truth, correctAnswerIndex: 2, firstAnswerCorrect: false });
  });

  it("hides resources owned by another anonymous session", async () => {
    const otherSessionId = await database.seedSession();
    await expect(service.getPlayerCase(caseId, otherSessionId)).rejects.toThrow("CASE_NOT_FOUND");
  });

  it("deletes an owned image idempotently", async () => {
    await service.deleteImage(imageId, sessionId);
    await service.deleteImage(imageId, sessionId);

    expect(await service.isImageDeleted(imageId, sessionId)).toBe(true);
  });
});

